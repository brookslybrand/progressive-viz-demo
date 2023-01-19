// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true;
  internalEvents: {
    "xstate.init": { type: "xstate.init" };
  };
  invokeSrcNameMap: {
    animationLoop: "done.invoke.animationMachine.transitioning:invocation[0]";
  };
  missingImplementations: {
    actions: never;
    delays: never;
    guards: never;
    services: never;
  };
  eventsCausingActions: {
    setupInterruptedAnimation: "startAnimation";
    setupNewAnimation: "startAnimation";
    updateIntermediateDPath: "tick";
  };
  eventsCausingDelays: {};
  eventsCausingGuards: {
    isAnimationFinished: "tick";
    isDPathDifferent: "startAnimation";
  };
  eventsCausingServices: {
    animationLoop: "startAnimation";
  };
  matchesStates: "transitioning" | "waiting";
  tags: never;
}
