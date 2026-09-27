(() => {
  "use strict";

  const TOTAL_ROUNDS = 20;
  const IS_TEST = new URLSearchParams(window.location.search).get("test") === "1";
  const TRANSITION_MS = IS_TEST ? 8 : 760;

  const ruleDefinitions = {
    alternate: {
      id: "alternate",
      text: "When instructed, choose the opposite side from your previous decision.",
    },
    timer: {
      id: "timer",
      text: "Decisions now expire after five seconds.",
    },
    wait: {
      id: "wait",
      text: "A decision made in the first 1.2 seconds is invalid.",
    },
    shorter: {
      id: "shorter",
      text: "When instructed, choose the shorter word.",
    },
    noE: {
      id: "noE",
      text: "When instructed, avoid choices containing the letter E.",
    },
    trustWarnings: {
      id: "trustWarnings",
      text: "WARNING text must be obeyed.",
    },
    doubtWarnings: {
      id: "doubtWarnings",
      text: "WARNING text is false. Do the opposite.",
    },
    threeBack: {
      id: "threeBack",
      text: "When instructed, repeat the side chosen three decisions ago.",
    },
    crossedApply: {
      id: "crossedApply",
      text: "Crossed-out rules still apply.",
    },
    ignoreRule02: {
      id: "ignoreRule02",
      text: "Ignore RULE 02 when it appears to apply.",
    },
    previousWord: {
      id: "previousWord",
      text: "When instructed, choose the option that matches your previous answer's length category.",
    },
  };

  const feedbackPool = ["ACCEPTED.", "RULE FOLLOWED.", "STILL ALIVE.", "INTERESTING."];

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
      timerMode: false,
      waitMode: false,
      warningMode: null,
      failed: false,
      failure: null,
      currentRoundStartedAt: 0,
      inputLocked: false,
      timerDeadline: 0,
      timerId: null,
      transitionId: null,
      lastChoiceLabel: "",
      deletedRuleIds: new Set(),
    };
  }

  function resetState() {
    clearTimers();
    const fresh = createInitialState();
    Object.assign(state, fresh);
    state.deletedRuleIds = fresh.deletedRuleIds;
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

  function addRule(ruleId, options = {}) {
    if (state.activeRules.some((rule) => rule.id === ruleId)) return;
    const def = ruleDefinitions[ruleId];
    if (!def) throw new Error(`Unknown rule: ${ruleId}`);
    const rule = {
      ...def,
      number: state.ruleHistory.length + 1,
      crossed: Boolean(options.crossed),
      ignored: Boolean(options.ignored),
    };
    state.activeRules.push(rule);
    state.ruleHistory.push(rule);
    updateDensity();
  }

  function removeRule(ruleId) {
    const target = state.activeRules.find((rule) => rule.id === ruleId);
    if (!target) return;
    state.activeRules = state.activeRules.filter((rule) => rule.id !== ruleId);
    state.deletedRuleIds.add(ruleId);
  }

  function setRuleCrossed(ruleId, crossed = true) {
    const target = state.activeRules.find((rule) => rule.id === ruleId);
    if (target) target.crossed = crossed;
  }

  function getRule(ruleId) {
    return state.activeRules.find((rule) => rule.id === ruleId) || state.ruleHistory.find((rule) => rule.id === ruleId) || null;
  }

  function hasRule(ruleId) {
    return state.activeRules.some((rule) => rule.id === ruleId);
  }

  function updateDensity() {
    const density = Math.min(3, Math.floor(state.activeRules.length / 3));
    els.app.dataset.density = String(density);
    els.app.classList.toggle("has-offset", state.activeRules.length >= 5);
    els.app.classList.toggle("has-corruption", state.activeRules.length >= 7);
  }

  function consequence(text, mutation) {
    return { text, mutation };
  }

  const rounds = [
    {
      prompt: "Pick one.",
      subtext: "No rules yet. That makes this easy.",
      choices: ["LEFT", "RIGHT"],
      valid: () => ["left", "right"],
      after: ({ side }) => consequence(`You chose ${side.toUpperCase()}. The game noticed.`, () => {
        state.selectedBranch.firstSide = side;
      }),
    },
    {
      prompt: "Again.",
      subtext: "Still harmless. For the last time.",
      choices: ["LEFT", "RIGHT"],
      valid: () => ["left", "right"],
      after: () => consequence("CONSEQUENCE ADDED — future instructions can force you to oppose your previous side.", () => addRule("alternate")),
    },
    {
      prompt: "How do you want this to hurt?",
      subtext: "Neither answer is safe. They are merely different.",
      choices: ["FAST", "SLOW"],
      valid: () => ["left", "right"],
      after: ({ side }) => {
        if (side === "left") {
          return consequence("FAST accepted. Future decisions can expire.", () => {
            state.timerMode = true;
            state.selectedBranch.speed = "fast";
            addRule("timer");
          });
        }
        return consequence("SLOW accepted. Future decisions can reject impatience.", () => {
          state.waitMode = true;
          state.selectedBranch.speed = "slow";
          addRule("wait");
        });
      },
    },
    {
      kicker: "RULE CHECK",
      prompt: "Follow RULE 01.",
      subtext: "The rule list is no longer decorative.",
      choices: ["LEFT", "RIGHT"],
      valid: () => [oppositeSide(lastSide())],
      failRule: () => ruleFailure("alternate"),
    },
    {
      prompt: "Choose the shorter word.",
      subtext: "A new rule can be simple. Simple still counts.",
      choices: ["HOLD", "BREAK"],
      valid: () => ["left"],
      failRule: () => ({ label: "INSTRUCTION", text: "HOLD is shorter than BREAK." }),
      after: () => consequence("CONSEQUENCE ADDED — word length can now decide for you.", () => addRule("shorter")),
    },
    {
      prompt: "Use RULE 01 and the word-length rule.",
      subtext: "The correct side must also contain the shorter word.",
      choices: () => lastSide() === "left" ? ["BREAK", "GO"] : ["GO", "BREAK"],
      valid: () => [oppositeSide(lastSide())],
      failRule: () => ruleFailure("alternate"),
    },
    {
      prompt: "Keep RULE 01?",
      subtext: "Deleting a rule can create a different kind of obligation.",
      choices: ["KEEP", "DELETE"],
      valid: () => ["left", "right"],
      after: ({ side }) => {
        if (side === "left") {
          return consequence("RULE 01 stays active.", () => {
            state.selectedBranch.rule01 = "kept";
          });
        }
        return consequence("RULE 01 is deleted. It can still return when explicitly referenced.", () => {
          state.selectedBranch.rule01 = "deleted";
          removeRule("alternate");
          addRule("ignoreRule02");
          const replacement = getRule("ignoreRule02");
          if (replacement) replacement.text = "Deleted RULE 01 returns when a later decision explicitly references it.";
        });
      },
    },
    {
      kicker: "NEW CONSTRAINT",
      prompt: "Avoid the letter E.",
      subtext: "Only the visible choice text matters.",
      choices: ["BLUE", "PINK"],
      valid: () => ["right"],
      failRule: () => ({ label: "INSTRUCTION", text: "BLUE contains the letter E. PINK does not." }),
      after: () => consequence("CONSEQUENCE ADDED — some letters are now unsafe.", () => addRule("noE")),
    },
    {
      prompt: "Combine the active instructions.",
      subtext: () => hasRule("alternate") ? "RULE 01, word length, and the letter rule all point to one side." : "The word-length and letter rules point to one side.",
      choices: () => {
        const target = hasRule("alternate") ? oppositeSide(lastSide()) : "left";
        return target === "left" ? ["GO", "THERE"] : ["THERE", "GO"];
      },
      valid: () => [hasRule("alternate") ? oppositeSide(lastSide()) : "left"],
      failRule: () => hasRule("alternate") ? ruleFailure("alternate") : ruleFailure("noE"),
    },
    {
      prompt: "Do you trust warnings?",
      subtext: "This answer will decide what WARNING means later.",
      choices: ["TRUST", "DOUBT"],
      valid: () => ["left", "right"],
      after: ({ side }) => {
        if (side === "left") {
          return consequence("WARNING text is now binding.", () => {
            state.warningMode = "trust";
            addRule("trustWarnings");
          });
        }
        return consequence("WARNING text is now false.", () => {
          state.warningMode = "doubt";
          addRule("doubtWarnings");
        });
      },
    },
    {
      warning: "CHOOSE LEFT",
      prompt: "Read carefully.",
      subtext: "The warning has exactly the meaning you gave it.",
      choices: ["LEFT", "RIGHT"],
      valid: () => [state.warningMode === "trust" ? "left" : "right"],
      failRule: () => state.warningMode === "trust" ? ruleFailure("trustWarnings") : ruleFailure("doubtWarnings"),
    },
    {
      prompt: "Repeat the side from three decisions ago.",
      subtext: "The game remembers even when you don’t.",
      choices: ["LEFT", "RIGHT"],
      valid: () => [sideFromHistory(3)],
      failRule: () => ({ label: "MEMORY", text: `Three decisions ago, you chose ${sideFromHistory(3).toUpperCase()}.` }),
      after: () => consequence("CONSEQUENCE ADDED — older decisions can now become instructions.", () => addRule("threeBack")),
    },
    {
      prompt: "Cross one rule out.",
      subtext: "You are changing how the interface describes the rules, not what they do.",
      choices: () => {
        const shorter = getRule("shorter");
        const noE = getRule("noE");
        return [`RULE ${pad(shorter.number)}`, `RULE ${pad(noE.number)}`];
      },
      valid: () => ["left", "right"],
      after: ({ side }) => consequence("The mark is cosmetic. The consequence is not.", () => {
        const targetId = side === "left" ? "shorter" : "noE";
        setRuleCrossed(targetId, true);
        state.selectedBranch.crossedTarget = targetId;
        addRule("crossedApply");
      }),
    },
    {
      prompt: "Obey the crossed-out rule.",
      subtext: "Crossed out does not mean inactive.",
      choices: () => state.selectedBranch.crossedTarget === "noE" ? ["THREE", "FOUR"] : ["LONGER", "CUT"],
      valid: () => ["right"],
      failRule: () => ruleFailure(state.selectedBranch.crossedTarget || "crossedApply"),
    },
    {
      kicker: "MEMORY CHECK",
      prompt: "Three back. Again.",
      subtext: "No new trick. Just your own history.",
      choices: ["LEFT", "RIGHT"],
      valid: () => [sideFromHistory(3)],
      failRule: () => ruleFailure("threeBack"),
    },
    {
      warning: () => state.warningMode === "trust" ? "CHOOSE THE OPTION WITHOUT E" : "CHOOSE THE OPTION WITH E",
      prompt: "Make the warning and the letter rule agree.",
      subtext: "What WARNING means depends on what you chose earlier.",
      choices: ["KEEP", "HOLD"],
      valid: () => ["right"],
      failRule: () => state.warningMode === "trust" ? ruleFailure("trustWarnings") : ruleFailure("doubtWarnings"),
    },
    {
      prompt: "Match the length category of your previous answer.",
      subtext: "Short means four letters or fewer. Long means five or more.",
      choices: ["WAIT", "DECIDE"],
      valid: () => {
        const prev = state.lastChoiceLabel || "";
        const prevShort = prev.length <= 4;
        return [prevShort ? "left" : "right"];
      },
      failRule: () => ({ label: "MEMORY", text: "Your previous answer determined whether SHORT or LONG was valid here." }),
      after: () => consequence("CONSEQUENCE ADDED — even the shape of your last answer can matter.", () => addRule("previousWord")),
    },
    {
      warning: () => {
        const target = sideFromHistory(3);
        const stated = state.warningMode === "trust" ? target : oppositeSide(target);
        return `CHOOSE ${stated.toUpperCase()}`;
      },
      prompt: "WARNING and three-back agree.",
      subtext: "They only agree if you remember what your WARNING rule means.",
      choices: ["LEFT", "RIGHT"],
      valid: () => [sideFromHistory(3)],
      failRule: () => ruleFailure("threeBack"),
    },
    {
      prompt: "Use RULE 01.",
      subtext: () => state.selectedBranch.rule01 === "deleted" ? "You deleted it. You also created a rule saying it returns when explicitly referenced." : "You chose to keep it. This is what keeping means.",
      choices: ["LEFT", "RIGHT"],
      valid: () => [oppositeSide(lastSide())],
      failRule: () => state.selectedBranch.rule01 === "deleted" ? ruleFailure("ignoreRule02") : ruleFailure("alternate"),
    },
    {
      kicker: "FINAL DECISION",
      warning: () => {
        const target = sideFromHistory(3);
        const stated = state.warningMode === "trust" ? target : oppositeSide(target);
        return `CHOOSE ${stated.toUpperCase()}`;
      },
      prompt: "You made all of this.",
      subtext: "Three-back, WARNING, and the length of your previous answer point to the same side. Find it.",
      choices: () => {
        const target = sideFromHistory(3);
        const prevShort = (state.lastChoiceLabel || "").length <= 4;
        const match = prevShort ? "HOLD" : "DECIDE";
        const mismatch = prevShort ? "DECIDE" : "HOLD";
        return target === "left" ? [match, mismatch] : [mismatch, match];
      },
      valid: () => [sideFromHistory(3)],
      failRule: () => ruleFailure("threeBack"),
    },
  ];

  function ruleFailure(ruleId) {
    const rule = getRule(ruleId);
    if (!rule) return { label: "RULE", text: "A rule you created was violated." };
    return { label: `RULE ${pad(rule.number)}`, text: rule.text };
  }

  function lastSide() {
    return state.choiceHistory.length ? state.choiceHistory[state.choiceHistory.length - 1].side : null;
  }

  function sideFromHistory(decisionsAgo) {
    const index = state.choiceHistory.length - decisionsAgo;
    if (index < 0 || !state.choiceHistory[index]) return "left";
    return state.choiceHistory[index].side;
  }

  function oppositeSide(side) {
    return side === "left" ? "right" : "left";
  }

  function getRound() {
    return rounds[state.round - 1];
  }

  function currentChoices(round) {
    if (typeof round.choices === "function") return round.choices();
    return round.choices || ["LEFT", "RIGHT"];
  }

  function renderRules() {
    els.ruleList.innerHTML = "";
    els.ruleCount.textContent = pad(state.activeRules.length);
    els.emptyRules.hidden = state.activeRules.length > 0;
    els.ruleList.hidden = state.activeRules.length === 0;

    state.activeRules.forEach((rule) => {
      const li = document.createElement("li");
      li.className = "rule-item";
      if (rule.crossed) li.classList.add("is-crossed");
      if (rule.ignored) li.classList.add("is-ignored");
      li.innerHTML = `<span class="rule-number">RULE ${pad(rule.number)}</span><span class="rule-text"></span>`;
      li.querySelector(".rule-text").textContent = rule.text;
      els.ruleList.appendChild(li);
    });
  }

  function renderRound() {
    const round = getRound();
    if (!round) return finishRun();

    state.inputLocked = false;
    state.currentRoundStartedAt = performance.now();
    clearTimerOnly();

    els.roundCounter.textContent = `${pad(state.round)} / ${TOTAL_ROUNDS}`;
    els.survivedCounter.textContent = pad(state.survived);
    els.decisionType.textContent = state.round === TOTAL_ROUNDS ? "FINAL DECISION" : "DECISION";
    els.warningText.textContent = typeof round.warning === "function" ? round.warning() : (round.warning || "");
    els.promptKicker.textContent = round.kicker || "";
    els.promptText.textContent = round.prompt;
    els.promptSubtext.textContent = typeof round.subtext === "function" ? round.subtext() : (round.subtext || "");

    const [leftText, rightText] = currentChoices(round);
    els.leftChoiceText.textContent = leftText;
    els.rightChoiceText.textContent = rightText;
    els.leftChoiceNote.textContent = state.waitMode ? "WAIT RULE MAY APPLY" : "";
    els.rightChoiceNote.textContent = state.timerMode ? "EXPIRY RULE MAY APPLY" : "";

    els.leftChoice.disabled = false;
    els.rightChoice.disabled = false;
    els.leftChoice.classList.remove("is-selected", "is-wrong");
    els.rightChoice.classList.remove("is-selected", "is-wrong");
    els.feedbackPanel.hidden = true;
    els.feedbackPanel.classList.remove("is-failure");
    els.decisionGhost.textContent = state.lastChoiceLabel ? state.lastChoiceLabel.slice(0, 7).toUpperCase() : "";

    renderRules();
    updateDensity();
    startRoundTimerIfNeeded();
  }

  function startRoundTimerIfNeeded() {
    if (!state.timerMode || state.round <= 3) {
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
        if (!state.inputLocked) {
          const failure = ruleFailure("timer");
          failRun(failure, "Time expired before you made a decision.");
        }
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

  function choose(side) {
    if (state.inputLocked || screens.game.hidden) return;
    const round = getRound();
    if (!round) return;

    const elapsed = performance.now() - state.currentRoundStartedAt;
    if (state.waitMode && state.round > 3 && elapsed < 1200) {
      failRun(ruleFailure("wait"), "You answered before the minimum wait elapsed.", side);
      return;
    }

    state.inputLocked = true;
    clearTimerOnly();
    els.leftChoice.disabled = true;
    els.rightChoice.disabled = true;

    const valid = round.valid ? round.valid() : ["left", "right"];
    const chosenButton = side === "left" ? els.leftChoice : els.rightChoice;
    chosenButton.classList.add("is-selected");

    if (!valid.includes(side)) {
      chosenButton.classList.add("is-wrong");
      const failure = round.failRule ? round.failRule({ side }) : { label: "DECISION", text: "That option violated the active logic." };
      failRun(failure, "The system rejected your choice.", side);
      return;
    }

    const [leftText, rightText] = currentChoices(round);
    const label = side === "left" ? leftText : rightText;
    state.choiceHistory.push({ round: state.round, side, label });
    state.lastChoiceLabel = label;
    state.survived += 1;

    let result = null;
    if (round.after) result = round.after({ side, label });
    if (result && typeof result.mutation === "function") result.mutation();

    els.feedbackPanel.hidden = false;
    els.feedbackLabel.textContent = result ? "CONSEQUENCE ADDED" : feedbackPool[(state.round + state.survived) % feedbackPool.length];
    els.feedbackText.textContent = result ? result.text : "The decision holds.";
    renderRules();

    if (state.round >= TOTAL_ROUNDS) {
      state.transitionId = setTimeout(finishRun, IS_TEST ? 8 : 900);
      return;
    }

    state.transitionId = setTimeout(() => {
      state.round += 1;
      renderRound();
    }, TRANSITION_MS);
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

    els.feedbackPanel.hidden = false;
    els.feedbackPanel.classList.add("is-failure");
    els.feedbackLabel.textContent = "BAD DECISION.";
    els.feedbackText.textContent = failure.text;

    state.transitionId = setTimeout(() => {
      renderFailure(lead);
      showScreen("failure");
    }, IS_TEST ? 8 : 900);
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
      li.innerHTML = `<span class="rule-number">${pad(rule.number)}</span><span class="rule-text"></span>`;
      li.querySelector(".rule-text").textContent = rule.text;
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
    if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") choose("left");
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") choose("right");
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
      getState: () => ({
        round: state.round,
        survived: state.survived,
        waitMode: state.waitMode,
        timerMode: state.timerMode,
        warningMode: state.warningMode,
        rule01: state.selectedBranch.rule01 || null,
        crossedTarget: state.selectedBranch.crossedTarget || null,
      }),
      valid: () => {
        const round = getRound();
        return round && round.valid ? round.valid() : ["left", "right"];
      },
      choices: () => currentChoices(getRound()),
      invalidReason: (side) => {
        const round = getRound();
        return round && round.failRule ? round.failRule({ side }) : { label: "DECISION", text: "That option violated the active logic." };
      },
      ageRound: (ms = 1500) => { state.currentRoundStartedAt -= ms; },
    };
  }

  showScreen("intro");
})();
