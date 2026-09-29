(() => {
  "use strict";

  const TOTAL_ROUNDS = 20;
  const IS_TEST = new URLSearchParams(window.location.search).get("test") === "1";
  const TRANSITION_MS = IS_TEST ? 0 : 760;
  const SECONDARY_FEEDBACK_MS = IS_TEST ? 0 : 520;

  const SIDE_ORDER = ["left", "right"];
  const feedbackPool = ["ACCEPTED.", "RULE FOLLOWED.", "STILL ALIVE.", "INTERESTING."];

  const ruleDefinitions = {
    alternate: {
      id: "alternate",
      text: "Never choose the same side twice.",
      test: ({ side, state }) => !lastSide(state) || side !== lastSide(state),
    },
    timer: {
      id: "timer",
      text: "When in force, choose before five seconds expire.",
      timing: "timer",
      test: () => true,
    },
    wait: {
      id: "wait",
      text: "When in force, wait 1.2 seconds before choosing.",
      timing: "wait",
      test: () => true,
    },
    shorter: {
      id: "shorter",
      text: "Choose the shorter word.",
      test: ({ side, pair }) => pair.shorterSide === side,
    },
    noE: {
      id: "noE",
      text: "Avoid choices containing the letter E.",
      test: ({ side, pair }) => !pair.meta[side].containsE,
    },
    threeBack: {
      id: "threeBack",
      text: "Repeat the side chosen three decisions ago.",
      test: ({ side, state }) => {
        const target = sideThreeBack(state);
        return target ? side === target : true;
      },
    },
    oppositeThreeBack: {
      id: "oppositeThreeBack",
      text: "Avoid the side chosen three decisions ago.",
      test: ({ side, state }) => {
        const target = sideThreeBack(state);
        return target ? side !== target : true;
      },
    },
    markedSide: {
      id: "markedSide",
      text: "When invoked, choose the side you marked.",
      test: ({ side, rule }) => side === rule.meta.side,
    },
    erasedSide: {
      id: "erasedSide",
      text: "When invoked, avoid the side you erased.",
      test: ({ side, rule }) => side !== rule.meta.side,
    },
    savedLength: {
      id: "savedLength",
      text: "Choose a word in the length category you saved.",
      test: ({ side, pair, rule }) => pair.meta[side].lengthCategory === rule.meta.lengthCategory,
    },
    discardedLength: {
      id: "discardedLength",
      text: "Choose a word outside the length category you discarded.",
      test: ({ side, pair, rule }) => pair.meta[side].lengthCategory !== rule.meta.lengthCategory,
    },
    sameFirst: {
      id: "sameFirst",
      text: "Choose the same side as your first decision.",
      test: ({ side, state }) => side === state.selectedBranch.firstSide,
    },
    oppositeFirst: {
      id: "oppositeFirst",
      text: "Choose the opposite side from your first decision.",
      test: ({ side, state }) => side !== state.selectedBranch.firstSide,
    },
    crossedApply: {
      id: "crossedApply",
      text: "Crossed-out rules still apply when they are IN FORCE.",
      metaRule: true,
      test: () => true,
    },
    deletedReturn: {
      id: "deletedReturn",
      text: "A deleted rule can return when explicitly invoked.",
      test: (ctx) => {
        const snapshot = ctx.rule.meta && ctx.rule.meta.targetSnapshot;
        if (!snapshot) return true;
        const def = ruleDefinitions[snapshot.id];
        if (!def || snapshot.id === "deletedReturn") return true;
        return def.test({ ...ctx, rule: snapshot });
      },
    },
  };

  const rawPairTemplates = [
    { id: "hold-release", choices: ["HOLD", "RELEASE"] },
    { id: "mark-erase", choices: ["MARK", "ERASE"] },
    { id: "keep-drop", choices: ["KEEP", "DROP"] },
    { id: "stay-go", choices: ["STAY", "GO"] },
    { id: "push-pull", choices: ["PUSH", "PULL"] },
    { id: "allow-deny", choices: ["ALLOW", "DENY"] },
    { id: "save-discard", choices: ["SAVE", "DISCARD"] },
    { id: "accept-refuse", choices: ["ACCEPT", "REFUSE"] },
    { id: "lock-open", choices: ["LOCK", "OPEN"] },
    { id: "take-leave", choices: ["TAKE", "LEAVE"] },
    { id: "keep-release", choices: ["KEEP", "RELEASE"] },
    { id: "mark-drop", choices: ["MARK", "DROP"] },
    { id: "literal-sides", choices: ["LEFT", "RIGHT"], minRound: 17, maxRound: 19, callbackOnly: true },
  ];

  const pairTemplates = rawPairTemplates.map(buildPairTemplate);

  const screens = {
    intro: document.getElementById("introScreen"),
    game: document.getElementById("gameScreen"),
    failure: document.getElementById("failureScreen"),
    review: document.getElementById("reviewScreen"),
    win: document.getElementById("winScreen"),
  };

  const els = {
    app: document.getElementById("app"),
    startButton: document.getElementById("startButton"),
    roundCounter: document.getElementById("roundCounter"),
    survivedCounter: document.getElementById("survivedCounter"),
    timerWrap: document.getElementById("timerWrap"),
    timerValue: document.getElementById("timerValue"),
    rulesHeading: document.getElementById("rulesHeading"),
    ruleCount: document.getElementById("ruleCount"),
    ruleList: document.getElementById("ruleList"),
    emptyRules: document.getElementById("emptyRules"),
    decisionGhost: document.getElementById("decisionGhost"),
    decisionType: document.getElementById("decisionType"),
    warningText: document.getElementById("warningText"),
    promptKicker: document.getElementById("promptKicker"),
    promptText: document.getElementById("promptText"),
    promptSubtext: document.getElementById("promptSubtext"),
    leftChoice: document.getElementById("leftChoice"),
    rightChoice: document.getElementById("rightChoice"),
    leftChoiceText: document.getElementById("leftChoiceText"),
    rightChoiceText: document.getElementById("rightChoiceText"),
    leftChoiceNote: document.getElementById("leftChoiceNote"),
    rightChoiceNote: document.getElementById("rightChoiceNote"),
    feedbackPanel: document.getElementById("feedbackPanel"),
    feedbackLabel: document.getElementById("feedbackLabel"),
    feedbackText: document.getElementById("feedbackText"),
    failureLead: document.getElementById("failureLead"),
    failureRuleLabel: document.getElementById("failureRuleLabel"),
    failureRuleText: document.getElementById("failureRuleText"),
    failureRound: document.getElementById("failureRound"),
    failureSurvived: document.getElementById("failureSurvived"),
    failureRules: document.getElementById("failureRules"),
    retryButton: document.getElementById("retryButton"),
    reviewButton: document.getElementById("reviewButton"),
    reviewRuleList: document.getElementById("reviewRuleList"),
    reviewRound: document.getElementById("reviewRound"),
    reviewSurvived: document.getElementById("reviewSurvived"),
    reviewCause: document.getElementById("reviewCause"),
    reviewRestartButton: document.getElementById("reviewRestartButton"),
    winRuleList: document.getElementById("winRuleList"),
    winRuleCount: document.getElementById("winRuleCount"),
    winRestartButton: document.getElementById("winRestartButton"),
  };

  const state = createInitialState();

  function createInitialState() {
    return {
      round: 1,
      survived: 0,
      activeRules: [],
      ruleHistory: [],
      choiceHistory: [],
      selectedBranch: {},
      decisionSchedule: new Set(),
      usedDecisionIds: new Set(),
      usedCheckPairIds: new Set(),
      roundPlans: new Map(),
      failed: false,
      failure: null,
      currentRoundStartedAt: 0,
      inputLocked: false,
      timerDeadline: 0,
      timerId: null,
      transitionId: null,
      lastChoiceLabel: "",
      deletedRuleIds: new Set(),
      currentInForceIds: new Set(),
    };
  }

  function resetState() {
    clearTimers();
    const fresh = createInitialState();
    Object.assign(state, fresh);
    state.decisionSchedule = generateDecisionSchedule();
    els.app.className = "app-shell";
    els.app.dataset.density = "0";
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, screen]) => {
      screen.hidden = key !== name;
    });
    els.app.dataset.screen = name;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function sample(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function chooseN(rangeStart, rangeEnd, count) {
    const values = [];
    for (let n = rangeStart; n <= rangeEnd; n += 1) values.push(n);
    return shuffle(values).slice(0, count).sort((a, b) => a - b);
  }

  function generateDecisionSchedule() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const lateCount = Math.random() < 0.5 ? 2 : 3;
      const rounds = [
        ...chooseN(3, 7, 2),
        ...chooseN(8, 13, 2),
        ...chooseN(14, 19, lateCount),
      ].sort((a, b) => a - b);
      if (maxConsecutive(rounds) <= 2 && maxGap(rounds) <= 5) return new Set(rounds);
    }
    return new Set([3, 6, 9, 12, 15, 18]);
  }

  function maxConsecutive(rounds) {
    let max = 0;
    let current = 0;
    let previous = null;
    rounds.forEach((round) => {
      current = previous !== null && round === previous + 1 ? current + 1 : 1;
      max = Math.max(max, current);
      previous = round;
    });
    return max;
  }

  function maxGap(rounds) {
    const points = [2, ...rounds, 20];
    let gap = 0;
    for (let i = 1; i < points.length; i += 1) gap = Math.max(gap, points[i] - points[i - 1]);
    return gap;
  }

  function buildPairTemplate(raw) {
    const [left, right] = raw.choices;
    const meta = {
      left: buildWordMeta(left),
      right: buildWordMeta(right),
    };
    let shorterSide = null;
    if (meta.left.length !== meta.right.length) shorterSide = meta.left.length < meta.right.length ? "left" : "right";
    return { ...raw, meta, shorterSide };
  }

  function buildWordMeta(label) {
    const clean = label.replace(/[^A-Z]/gi, "");
    const length = clean.length;
    return {
      length,
      containsE: /e/i.test(clean),
      lengthCategory: length <= 4 ? "short" : "long",
    };
  }

  function addRule(ruleId, options = {}) {
    if (state.activeRules.some((rule) => rule.id === ruleId)) return null;
    const def = ruleDefinitions[ruleId];
    if (!def) throw new Error(`Unknown rule: ${ruleId}`);
    const rule = {
      id: def.id,
      text: options.text || def.text,
      number: state.ruleHistory.length + 1,
      crossed: Boolean(options.crossed),
      removed: false,
      meta: options.meta || {},
    };
    state.activeRules.push(rule);
    state.ruleHistory.push(rule);
    updateDensity();
    return rule;
  }

  function removeRule(ruleId) {
    const target = state.activeRules.find((rule) => rule.id === ruleId);
    if (!target) return null;
    state.activeRules = state.activeRules.filter((rule) => rule !== target);
    target.removed = true;
    state.deletedRuleIds.add(ruleId);
    updateDensity();
    return target;
  }

  function setRuleCrossed(ruleId, crossed = true) {
    const target = state.activeRules.find((rule) => rule.id === ruleId);
    if (target) target.crossed = crossed;
  }

  function getRule(ruleId) {
    return state.activeRules.find((rule) => rule.id === ruleId) || null;
  }

  function hasRule(ruleId) {
    return Boolean(getRule(ruleId));
  }

  function updateDensity() {
    const density = Math.min(3, Math.floor(state.activeRules.length / 3));
    els.app.dataset.density = String(density);
    els.app.classList.toggle("has-offset", state.activeRules.length >= 5);
    els.app.classList.toggle("has-corruption", state.activeRules.length >= 7);
  }

  function lastSide(targetState = state) {
    return targetState.choiceHistory.length ? targetState.choiceHistory[targetState.choiceHistory.length - 1].side : null;
  }

  function sideThreeBack(targetState = state) {
    const history = targetState.choiceHistory;
    return history.length >= 3 ? history[history.length - 3].side : null;
  }

  function oppositeSide(side) {
    return side === "left" ? "right" : "left";
  }

  function currentChoices(spec) {
    return spec && spec.pair ? spec.pair.choices : ["KEEP", "BREAK"];
  }

  function getRuleFailure(rule) {
    return {
      label: `RULE ${pad(rule.number)} VIOLATED`,
      text: rule.text,
      ruleId: rule.id,
    };
  }

  function testRule(rule, side, pair, targetState = state) {
    const def = ruleDefinitions[rule.id];
    if (!def) return true;
    return def.test({ side, pair, state: targetState, rule });
  }

  function validSidesForRules(rules, pair, targetState = state) {
    return SIDE_ORDER.filter((side) => rules.every((rule) => testRule(rule, side, pair, targetState)));
  }

  function firstViolatedRule(rules, side, pair) {
    return rules.find((rule) => !testRule(rule, side, pair, state)) || null;
  }

  const decisionDefinitions = [
    {
      id: "fast-slow",
      choices: ["FAST", "SLOW"],
      earliestRound: 3,
      latestRound: 7,
      prompt: "Set the pace.",
      applyChoice: ({ side }) => {
        if (side === "left") {
          addRule("timer");
          state.selectedBranch.speed = "fast";
          return "FAST accepted. Some future Rule Checks will expire.";
        }
        addRule("wait");
        state.selectedBranch.speed = "slow";
        return "SLOW accepted. Some future Rule Checks will reject impatience.";
      },
    },
    {
      id: "hold-release",
      choices: ["HOLD", "RELEASE"],
      earliestRound: 3,
      latestRound: 10,
      prompt: "What should control the words?",
      applyChoice: ({ side }) => {
        if (side === "left") {
          addRule("shorter");
          return "HOLD accepted. Word length can now decide for you.";
        }
        addRule("noE");
        return "RELEASE accepted. One letter can now disqualify a choice.";
      },
    },
    {
      id: "accept-refuse",
      choices: ["ACCEPT", "REFUSE"],
      earliestRound: 5,
      latestRound: 19,
      prompt: "How far back should this reach?",
      applyChoice: ({ side }) => {
        if (side === "left") {
          addRule("threeBack");
          return "ACCEPT recorded. Three decisions ago can now become binding.";
        }
        addRule("oppositeThreeBack");
        return "REFUSE recorded. Three decisions ago can now become forbidden.";
      },
    },
    {
      id: "mark-erase",
      choices: ["MARK", "ERASE"],
      earliestRound: 6,
      latestRound: 19,
      prompt: "Leave a mark.",
      requires: () => state.choiceHistory.length >= 4,
      applyChoice: ({ side }) => {
        if (side === "left") {
          addRule("markedSide", { meta: { side } });
          return "MARK recorded. This physical side can be called back later.";
        }
        addRule("erasedSide", { meta: { side } });
        return "ERASE recorded. This physical side can become forbidden later.";
      },
    },
    {
      id: "save-discard",
      choices: ["SAVE", "DISCARD"],
      earliestRound: 8,
      latestRound: 19,
      prompt: "What survives this decision?",
      requires: () => state.choiceHistory.length >= 5,
      applyChoice: ({ side, label }) => {
        const lengthCategory = buildWordMeta(label).lengthCategory;
        if (side === "left") {
          addRule("savedLength", { meta: { lengthCategory } });
          return `SAVE recorded. ${lengthCategory.toUpperCase()} words can be required later.`;
        }
        addRule("discardedLength", { meta: { lengthCategory } });
        return `DISCARD recorded. ${lengthCategory.toUpperCase()} words can be rejected later.`;
      },
    },
    {
      id: "keep-delete",
      choices: ["KEEP", "DELETE"],
      earliestRound: 9,
      latestRound: 19,
      prompt: (plan) => `What happens to RULE ${pad(plan.targetRule.number)}?`,
      requires: () => Boolean(findRemovableRule()),
      prepare: () => ({ targetRule: findRemovableRule() }),
      applyChoice: ({ side, plan }) => {
        const target = plan.targetRule && getRule(plan.targetRule.id);
        if (!target) return "Nothing moved. The system found no eligible rule.";
        if (side === "left") {
          setRuleCrossed(target.id, true);
          addRule("crossedApply");
          return `RULE ${pad(target.number)} stays on file. Crossing it out does not protect you.`;
        }
        const removed = removeRule(target.id);
        if (removed) {
          addRule("deletedReturn", {
            text: `Deleted RULE ${pad(removed.number)} can return when explicitly invoked.`,
            meta: { targetSnapshot: cloneRule(removed) },
          });
          return `RULE ${pad(removed.number)} deleted. The deletion created its own consequence.`;
        }
        return "The deletion failed cleanly. Nothing else changed.";
      },
    },
    {
      id: "open-close",
      choices: ["OPEN", "CLOSE"],
      earliestRound: 12,
      latestRound: 19,
      prompt: "Return to the beginning?",
      requires: () => Boolean(state.selectedBranch.firstSide),
      applyChoice: ({ side }) => {
        if (side === "left") {
          addRule("sameFirst");
          return "OPEN recorded. Your first physical side can return later.";
        }
        addRule("oppositeFirst");
        return "CLOSE recorded. Your first physical side can become the wrong one.";
      },
    },
  ];

  function cloneRule(rule) {
    return {
      id: rule.id,
      text: rule.text,
      number: rule.number,
      crossed: rule.crossed,
      removed: rule.removed,
      meta: JSON.parse(JSON.stringify(rule.meta || {})),
    };
  }

  function findRemovableRule() {
    const excluded = new Set(["alternate", "timer", "wait", "crossedApply", "deletedReturn"]);
    return [...state.activeRules].reverse().find((rule) => !excluded.has(rule.id) && !rule.crossed) || null;
  }

  function isDecisionEligible(def, round) {
    if (state.usedDecisionIds.has(def.id)) return false;
    if (round < def.earliestRound || round > def.latestRound) return false;
    return !def.requires || def.requires();
  }

  function chooseDecisionDefinition(round) {
    const eligible = decisionDefinitions.filter((def) => isDecisionEligible(def, round));
    if (!eligible.length) {
      const fallback = decisionDefinitions.find((def) => !state.usedDecisionIds.has(def.id) && (!def.requires || def.requires()));
      if (!fallback) throw new Error(`No eligible Decision definition for round ${round}.`);
      return fallback;
    }
    if (round <= 7) {
      const speed = eligible.find((def) => def.id === "fast-slow");
      if (speed) return speed;
    }
    return sample(eligible);
  }

  function createDecisionPlan(round) {
    const def = chooseDecisionDefinition(round);
    state.usedDecisionIds.add(def.id);
    const prepared = def.prepare ? def.prepare() : {};
    const choices = def.choices.slice();
    const pair = buildPairTemplate({ id: `decision-${def.id}-${round}`, choices });
    const plan = {
      round,
      type: "decision",
      decisionId: def.id,
      label: "DECISION",
      prompt: typeof def.prompt === "function" ? def.prompt(prepared) : def.prompt,
      subtext: "You are changing the system.",
      pair,
      validSides: ["left", "right"],
      ...prepared,
      applyChoice: def.applyChoice,
    };
    return plan;
  }

  function createCalibrationPlan(round) {
    if (round === 1) {
      return {
        round,
        type: "calibration",
        label: "CALIBRATION 01",
        prompt: "Pick one. Nothing can kill you yet.",
        subtext: "The system is watching position, not meaning.",
        pair: buildPairTemplate({ id: "calibration-1", choices: ["KEEP", "BREAK"] }),
        validSides: ["left", "right"],
        applyChoice: ({ side }) => {
          state.selectedBranch.firstSide = side;
          return {
            label: "POSITION RECORDED.",
            text: "Physical side stored.",
          };
        },
      };
    }
    return {
      round,
      type: "calibration",
      label: "CALIBRATION 02",
      prompt: "Again. This one will matter later.",
      subtext: "The system is still recording you.",
      pair: buildPairTemplate({ id: "calibration-2", choices: ["TAKE", "LEAVE"] }),
      validSides: ["left", "right"],
      applyChoice: () => {
        addRule("alternate");
        return {
          label: "PATTERN RECORDED.",
          text: "The second position is stored.",
          secondary: {
            label: "CONSEQUENCE ADDED",
            text: "Never choose the same side twice.",
          },
        };
      },
    };
  }

  function targetRuleCount(round) {
    if (round <= 7) return 1;
    if (round <= 12) return randomInt(1, 2);
    if (round <= 16) return randomInt(2, 3);
    if (round <= 19) return randomInt(3, 4);
    return randomInt(4, 5);
  }

  function combinations(items, size) {
    const output = [];
    const walk = (start, chosen) => {
      if (chosen.length === size) {
        output.push(chosen.slice());
        return;
      }
      for (let i = start; i <= items.length - (size - chosen.length); i += 1) {
        chosen.push(items[i]);
        walk(i + 1, chosen);
        chosen.pop();
      }
    };
    walk(0, []);
    return output;
  }

  function pairIsEligible(pair, round) {
    if (pair.minRound && round < pair.minRound) return false;
    if (pair.maxRound && round > pair.maxRound) return false;
    if (pair.callbackOnly && state.usedCheckPairIds.has(pair.id)) return false;
    return true;
  }

  function hasSideConstraint(rules) {
    return rules.some((rule) => {
      const def = ruleDefinitions[rule.id];
      return def && !def.timing && !def.metaRule;
    });
  }

  function createRuleCheckPlan(round) {
    const active = state.activeRules.slice();
    if (!active.length) throw new Error(`Rule Check at round ${round} has no Rules On File.`);

    const desired = Math.min(targetRuleCount(round), active.length);
    const pairPool = shuffle(pairTemplates.filter((pair) => pairIsEligible(pair, round)));
    const requireUnique = round >= 8;

    for (let size = desired; size >= 1; size -= 1) {
      const subsets = shuffle(combinations(active, size));
      for (const rules of subsets) {
        if (requireUnique && !hasSideConstraint(rules)) continue;
        for (const pair of pairPool) {
          const validSides = validSidesForRules(rules, pair);
          if (!validSides.length) continue;
          if (requireUnique && validSides.length !== 1) continue;
          state.usedCheckPairIds.add(pair.id);
          return makeRuleCheck(round, rules, pair, validSides);
        }
      }
    }

    // Safety fallback: find any solvable single-rule check. This should be rare and remains fair.
    for (const rule of shuffle(active)) {
      for (const pair of pairPool) {
        const validSides = validSidesForRules([rule], pair);
        if (validSides.length) {
          state.usedCheckPairIds.add(pair.id);
          return makeRuleCheck(round, [rule], pair, validSides);
        }
      }
    }

    throw new Error(`Unable to build a solvable Rule Check for round ${round}.`);
  }

  function makeRuleCheck(round, rules, pair, validSides) {
    const count = rules.length;
    let prompt = count === 1 ? "One rule. Follow it." : count === 2 ? "Two rules. Reconcile them." : "Reconcile the rules.";
    if (round === TOTAL_ROUNDS) prompt = "Everything you kept is here.";
    const timingRules = rules.filter((rule) => ruleDefinitions[rule.id] && ruleDefinitions[rule.id].timing);
    return {
      round,
      type: "check",
      label: round === TOTAL_ROUNDS ? "RULE CHECK / FINAL" : "RULE CHECK",
      prompt,
      subtext: "The system is testing you.",
      pair,
      inForceRules: rules,
      validSides,
      timingRules,
    };
  }

  function getRoundPlan() {
    if (state.roundPlans.has(state.round)) return state.roundPlans.get(state.round);
    let plan;
    if (state.round <= 2) plan = createCalibrationPlan(state.round);
    else if (state.decisionSchedule.has(state.round)) plan = createDecisionPlan(state.round);
    else plan = createRuleCheckPlan(state.round);
    state.roundPlans.set(state.round, plan);
    return plan;
  }

  function renderRules() {
    const forceIds = state.currentInForceIds;
    els.ruleList.innerHTML = "";
    els.ruleCount.textContent = pad(state.activeRules.length);
    els.emptyRules.hidden = state.activeRules.length > 0;
    els.ruleList.hidden = state.activeRules.length === 0;

    state.activeRules.forEach((rule) => {
      const li = document.createElement("li");
      li.className = "rule-item";
      if (rule.crossed) li.classList.add("is-crossed");
      if (forceIds.has(rule.id)) li.classList.add("is-in-force");
      li.innerHTML = `
        <span class="rule-number">RULE ${pad(rule.number)}</span>
        <span class="rule-text"></span>
        <span class="rule-force">${forceIds.has(rule.id) ? "IN FORCE" : ""}</span>
      `;
      li.querySelector(".rule-text").textContent = rule.text;
      els.ruleList.appendChild(li);
    });
  }

  function renderRound() {
    const plan = getRoundPlan();
    state.inputLocked = false;
    state.currentRoundStartedAt = performance.now();
    clearTimerOnly();
    state.currentInForceIds = new Set(plan.type === "check" ? plan.inForceRules.map((rule) => rule.id) : []);

    els.roundCounter.textContent = `${pad(state.round)} / ${TOTAL_ROUNDS}`;
    els.survivedCounter.textContent = pad(state.survived);
    els.decisionType.textContent = plan.label;
    els.warningText.textContent = plan.type === "check" ? `${plan.inForceRules.length} ${plan.inForceRules.length === 1 ? "RULE" : "RULES"} IN FORCE` : "";
    els.promptKicker.textContent = "";
    els.promptText.textContent = plan.prompt;
    els.promptSubtext.textContent = plan.subtext || "";

    const [leftText, rightText] = currentChoices(plan);
    els.leftChoiceText.textContent = leftText;
    els.rightChoiceText.textContent = rightText;
    els.leftChoiceNote.textContent = "";
    els.rightChoiceNote.textContent = "";

    const timerRule = plan.type === "check" && plan.inForceRules.find((rule) => rule.id === "timer");
    const waitRule = plan.type === "check" && plan.inForceRules.find((rule) => rule.id === "wait");
    if (waitRule) els.leftChoiceNote.textContent = "WAIT 1.2s";
    if (timerRule) els.rightChoiceNote.textContent = "5.0s WINDOW";

    els.leftChoice.disabled = false;
    els.rightChoice.disabled = false;
    els.leftChoice.classList.remove("is-selected", "is-wrong");
    els.rightChoice.classList.remove("is-selected", "is-wrong");
    els.feedbackPanel.hidden = true;
    els.feedbackPanel.classList.remove("is-failure");
    els.decisionGhost.textContent = state.lastChoiceLabel ? state.lastChoiceLabel.slice(0, 7).toUpperCase() : "";

    renderRules();
    updateDensity();
    startRoundTimerIfNeeded(plan);
  }

  function startRoundTimerIfNeeded(plan) {
    const timerRule = plan.type === "check" && plan.inForceRules.find((rule) => rule.id === "timer");
    if (!timerRule) {
      els.timerWrap.hidden = true;
      return;
    }

    els.timerWrap.hidden = false;
    els.timerWrap.classList.remove("is-urgent");
    state.timerDeadline = performance.now() + 5000;

    const tick = () => {
      const remaining = Math.max(0, state.timerDeadline - performance.now());
      els.timerValue.textContent = (remaining / 1000).toFixed(1);
      els.timerWrap.classList.toggle("is-urgent", remaining <= 2000);
      if (remaining <= 0) {
        clearTimerOnly();
        if (!state.inputLocked) failRun(getRuleFailure(timerRule), "Time expired before you made a decision.");
        return;
      }
      state.timerId = requestAnimationFrame(tick);
    };
    state.timerId = requestAnimationFrame(tick);
  }

  function clearTimerOnly() {
    if (state.timerId) cancelAnimationFrame(state.timerId);
    state.timerId = null;
    els.timerWrap.classList.remove("is-urgent");
  }

  function clearTimers() {
    clearTimerOnly();
    if (state.transitionId) clearTimeout(state.transitionId);
    state.transitionId = null;
  }

  function showFeedback(label, text, isFailure = false) {
    els.feedbackPanel.hidden = false;
    els.feedbackPanel.classList.toggle("is-failure", isFailure);
    els.feedbackLabel.textContent = label;
    els.feedbackText.textContent = text;
  }

  function choose(side) {
    if (state.inputLocked || screens.game.hidden) return;
    const plan = getRoundPlan();
    if (!plan) return;

    const elapsed = performance.now() - state.currentRoundStartedAt;
    if (plan.type === "check") {
      const waitRule = plan.inForceRules.find((rule) => rule.id === "wait");
      if (waitRule && elapsed < 1200) {
        failRun(getRuleFailure(waitRule), "You answered before the minimum wait elapsed.", side);
        return;
      }
    }

    state.inputLocked = true;
    clearTimerOnly();
    els.leftChoice.disabled = true;
    els.rightChoice.disabled = true;

    const chosenButton = side === "left" ? els.leftChoice : els.rightChoice;
    chosenButton.classList.add("is-selected");

    if (plan.type === "check" && !plan.validSides.includes(side)) {
      chosenButton.classList.add("is-wrong");
      const violated = firstViolatedRule(plan.inForceRules, side, plan.pair);
      const failure = violated ? getRuleFailure(violated) : { label: "RULE CHECK FAILED", text: "That choice did not satisfy the rules in force." };
      failRun(failure, "The system rejected your choice.", side);
      return;
    }

    const [leftText, rightText] = currentChoices(plan);
    const label = side === "left" ? leftText : rightText;
    state.choiceHistory.push({ round: state.round, side, label, type: plan.type });
    state.lastChoiceLabel = label;
    state.survived += 1;

    let result = null;
    if (plan.applyChoice) result = plan.applyChoice({ side, label, plan });

    if (typeof result === "string") {
      showFeedback("CONSEQUENCE ADDED", result);
    } else if (result && result.label) {
      showFeedback(result.label, result.text || "");
    } else {
      showFeedback(feedbackPool[(state.round + state.survived) % feedbackPool.length], "The decision holds.");
    }

    renderRules();

    const continueRun = () => {
      if (state.round >= TOTAL_ROUNDS) {
        finishRun();
        return;
      }
      state.round += 1;
      renderRound();
    };

    if (result && result.secondary) {
      state.transitionId = setTimeout(() => {
        showFeedback(result.secondary.label, result.secondary.text);
        state.transitionId = setTimeout(continueRun, TRANSITION_MS);
      }, SECONDARY_FEEDBACK_MS);
      return;
    }

    state.transitionId = setTimeout(continueRun, TRANSITION_MS);
  }

  function failRun(failure, lead, side = null) {
    state.inputLocked = true;
    state.failed = true;
    state.failure = failure;
    clearTimerOnly();
    els.leftChoice.disabled = true;
    els.rightChoice.disabled = true;

    if (side) {
      const chosenButton = side === "left" ? els.leftChoice : els.rightChoice;
      chosenButton.classList.add("is-selected", "is-wrong");
    }

    showFeedback("BAD DECISION.", failure.text, true);

    state.transitionId = setTimeout(() => {
      renderFailure(lead);
      showScreen("failure");
    }, IS_TEST ? 0 : 900);
  }

  function renderFailure(lead) {
    const failure = state.failure || { label: "RULE", text: "Unknown rule violation." };
    els.failureLead.textContent = lead || "You broke a rule.";
    els.failureRuleLabel.textContent = failure.label;
    els.failureRuleText.textContent = failure.text;
    els.failureRound.textContent = `${pad(state.round)} / ${TOTAL_ROUNDS}`;
    els.failureSurvived.textContent = pad(state.survived);
    els.failureRules.textContent = pad(state.activeRules.length);
  }

  function renderReview() {
    els.reviewRuleList.innerHTML = "";
    state.ruleHistory.forEach((rule) => {
      const li = document.createElement("li");
      li.className = "review-rule-item";
      const status = rule.removed ? " — DELETED" : rule.crossed ? " — CROSSED" : "";
      li.innerHTML = `<span class="rule-number">${pad(rule.number)}</span><span class="rule-text"></span>`;
      li.querySelector(".rule-text").textContent = `${rule.text}${status}`;
      els.reviewRuleList.appendChild(li);
    });
    if (!state.ruleHistory.length) {
      const li = document.createElement("li");
      li.className = "review-rule-item";
      li.textContent = "You failed before the rules could become interesting.";
      els.reviewRuleList.appendChild(li);
    }
    els.reviewRound.textContent = `${pad(state.round)} / ${TOTAL_ROUNDS}`;
    els.reviewSurvived.textContent = pad(state.survived);
    els.reviewCause.textContent = state.failure ? state.failure.label : "—";
  }

  function finishRun() {
    clearTimers();
    renderWin();
    showScreen("win");
  }

  function renderWin() {
    els.winRuleList.innerHTML = "";
    state.activeRules.forEach((rule) => {
      const li = document.createElement("li");
      li.className = "review-rule-item";
      li.innerHTML = `<span class="rule-number">RULE ${pad(rule.number)}</span><span class="rule-text"></span>`;
      li.querySelector(".rule-text").textContent = rule.text;
      els.winRuleList.appendChild(li);
    });
    els.winRuleCount.textContent = pad(state.activeRules.length);
  }

  function startGame() {
    resetState();
    showScreen("game");
    renderRound();
  }

  function onKeyDown(event) {
    if (screens.game.hidden) return;
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") choose("left");
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") choose("right");
  }

  function getDebugState() {
    const plan = state.roundPlans.get(state.round) || null;
    return {
      round: state.round,
      survived: state.survived,
      decisionSchedule: [...state.decisionSchedule],
      usedDecisionIds: [...state.usedDecisionIds],
      activeRuleIds: state.activeRules.map((rule) => rule.id),
      inForceIds: [...state.currentInForceIds],
      currentType: plan ? plan.type : null,
      currentLabel: plan ? plan.label : null,
      validSides: plan ? plan.validSides.slice() : [],
      choices: plan ? plan.pair.choices.slice() : [],
      failed: state.failed,
      failure: state.failure ? { ...state.failure } : null,
    };
  }

  els.startButton.addEventListener("click", startGame);
  els.leftChoice.addEventListener("click", () => choose("left"));
  els.rightChoice.addEventListener("click", () => choose("right"));
  els.retryButton.addEventListener("click", startGame);
  els.reviewButton.addEventListener("click", () => {
    renderReview();
    showScreen("review");
  });
  els.reviewRestartButton.addEventListener("click", startGame);
  els.winRestartButton.addEventListener("click", startGame);
  document.addEventListener("keydown", onKeyDown);

  if (IS_TEST) {
    window.__OBD_DEBUG__ = {
      start: startGame,
      choose,
      getState: getDebugState,
      getPlan: () => {
        const plan = getRoundPlan();
        return {
          round: plan.round,
          type: plan.type,
          label: plan.label,
          choices: plan.pair.choices.slice(),
          validSides: plan.validSides.slice(),
          inForceIds: plan.inForceRules ? plan.inForceRules.map((rule) => rule.id) : [],
          decisionId: plan.decisionId || null,
        };
      },
      ageRound: (ms = 1400) => { state.currentRoundStartedAt -= ms; },
      schedule: () => [...state.decisionSchedule],
      forceRender: renderRound,
    };
  }

  showScreen("intro");
})();
