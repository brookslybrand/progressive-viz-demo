// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true;
  eventsCausingActions: {
    setupNewAnimation: "startAnimation";
    updateIntermediateDPath: "tick";
    setupInterruptedAnimation: "startAnimation";
  };
  internalEvents: {
    "xstate.init": { type: "xstate.init" };
  };
  invokeSrcNameMap: {
    animationLoop: "done.invoke.animationMachine.transitioning:invocation[0]";
  };
  missingImplementations: {
    actions: never;
    services: never;
    guards: never;
    delays: never;
  };
  eventsCausingServices: {
    animationLoop: "startAnimation";
  };
  eventsCausingGuards: {
    isDPathDifferent: "startAnimation";
    isAnimationFinished: "tick";
  };
  eventsCausingDelays: {};
  matchesStates: "waiting" | "transitioning";
  tags: never;
}
