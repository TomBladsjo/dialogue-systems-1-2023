import { isContext } from "vm";
import { MachineConfig, send, Action, assign } from "xstate";

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

interface Grammar {
  [index: string]: {
    intent: string;
    entities: {
      [index: string]: string;
    };
  };
}

/* const grammar: Grammar = {
  lecture: {
    intent: "None",
    entities: { title: "Dialogue systems lecture" },
  },
  lunch: {
    intent: "None",
    entities: { title: "Lunch at the canteen" },  
  },
  "meeting": {
    intent: "meeting",
    entities: {},
  },
  "famousPerson": {
    intent: "famousPerson",
    entities: {},
  },
  "monday": {
    intent: "None",
    entities: { day: "Monday" },
  },
  "tuesday": {
    intent: "None",
    entities: { day: "Tuesday" }
  },
  "wednesday": {
    intent: "None",
    entities: { day: "Wednesday" }
  },
  "thursday": {
    intent: "None",
    entities: { day: "Thursday" }
  },
  
  "friday": {
    intent: "None",
    entities: { day: "Friday" },
  },

  "saturday": {
    intent: "None",
    entities: { day: "Saturday" }
  },
  
  "sunday": {
    intent: "None",
    entities: { day: "Sunday" }
  },
  
  "today": {
    intent: "None",
    entities: { day: "today" },
  },

  "tomorrow": {
    intent: "None",
    entities: { day: "tomorrow" },
  },
};

const getEntity = (context: SDSContext, entity: string) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "").replace(/^(on )/, "");
  if (u in grammar) {
    if (entity in grammar[u].entities) {
      return grammar[u].entities[entity];
    }
  }
  return false;
}; */

/* 
const yesnoQuestion = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase();
  const reYes = /yes/;
  const reNo = /no/;
  if (u.match(reYes)) {
    return "yes";
  } else if (u.match(reNo)) {
    return "no";
  }
  return false;
};

const getTime = (context: SDSContext) => {
  let u = context.recResult[0].utterance;
  const reTime = /([0-9:]+)( [AP]M)?/;
  let time = u.match(reTime);
  if (typeof time !== null ){
    return u.match(reTime)[0]
  } else {
  return false
  }
}; */

const speakTime = (time: string) => {
  if (time === "all day") {
    return "that lasts all day"
  } else {
    return `at ${time} o'clock`
  }
};

// const reMeeting = /meeting/;
// const reSearchInfo = /who is ([\w é]+)/;

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  id: "appointment",
  initial: "idle",
  states: {
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      on: {
        TTS_READY: "user", 
        CLICK: "user", 
      },
    },
    user: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "welcome",
            cond: (context) => !!context.nluResult.prediction.entities.length && context.nluResult.prediction.entities[0].category === "username",
            actions: assign({
              username: (context) => context.nluResult.prediction.entities[0].text.replace(/\.$/g, "")   
            }),
          },
          {
            target: ".nomatch"
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Hello! What is your name?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say("I'm sorry, could you repeat that?"),
          on: { ENDSPEECH: "ask" },
        }
      },
    },
    welcome: { 
    initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "famousPerson",
            cond: (context) => context.nluResult.prediction.topIntent === "famousPerson" && context.nluResult.prediction.entities[0].category === "person",
            actions: assign({
              person: (context) => {
                return context.nluResult.prediction.entities[0].text
              },
            })
          },       
          {
            target: "meeting",
            cond: (context) => context.nluResult.prediction.topIntent === "meeting",
          },
          {
            target: "goodbye",
            cond: (context) => context.nluResult.prediction.topIntent === "Reject",
          },
          {
            target: ".nomatch",
          }, 
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Welcome ${context.username}! How can I help you?`,
          })),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I don't know what that is. Tell me something I know."
          ),
          on: { ENDSPEECH: "ask" },
        },
        getIntent: {

        }
      },
    },
 famousPerson: {
      initial: "info",
      on: { 
        RECOGNISED: [
          {
            target: "meeting.day",
            cond: (context) => context.nluResult.prediction.topIntent === "Affirm",
            actions: assign({
              title: (context) => `Meeting with ${context.person}`,
            }),
          },
          {
            target: "goodbye",
            cond: (context) => context.nluResult.prediction.topIntent === "Reject",
          },
          {
            target: ".nomatch"
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        info: {
          invoke: {
            id: 'getInfo',
            src: (context, event) => kbRequest(context.person),
            onDone: [{
              target: 'success',
              cond: (context, event) => event.data.Abstract !== "",
              actions: assign({ info: (context, event) => event.data })
            },
            {
              target: 'noinfo',
            },
          ],
            onError: {
              target: 'failure',
              },
            },
          },
          success: {
            entry: send((context) => ({
              type: "SPEAK",
              value: context.info.Abstract, 
            })),
            on: {ENDSPEECH: "prompt"},  
          },
          failure: {
            entry: send((context) => ({
              type: "SPEAK",
              value: "I'm sorry, an error seems to have occurred. Let's try again.", 
            })),
            on: {ENDSPEECH: "#root.dm.welcome"},  
          },
          noinfo: {
            entry: send((context) => ({
              type: "SPEAK",
              value: "I'm sorry, I don't know anything about them. Can I do something else for you?", 
            })),
            on: {ENDSPEECH: "#root.dm.welcome.ask"},  
          },
        prompt: {
          entry: say("Would you like to meet them?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I didn't catch that."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    }, 
    goodbye: {
      entry: send((context) => ({
        type: "SPEAK",
        value: "Ok, goodbye.",
      })),
      on: { ENDSPEECH: "init" },
    }, 
    meeting: {
      initial: "title",
      states: {
      title: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "day",
            actions: assign({
              title: (context) => context.recResult[0].utterance.replace(/\.$/g, "")
            })
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Ok, let's create a meeting. What is it about?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
      },
    },
    day: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "allday",
            cond: (context) => !!context.nluResult.prediction.entities.length && context.nluResult.prediction.entities[0].category === "dateTime",
            actions: assign({
              day: (context) => context.nluResult.prediction.entities[0].resolutions[0].value,
            }),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("What day is the meeting?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I didn't catch that."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    allday: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "doublecheck",
            cond: (context) => context.nluResult.prediction.topIntent === "Affirm",
            actions: assign({
              time: (context) => "all day",
            }),
          },
          {
            target: "time",
            cond: (context) => context.nluResult.prediction.topIntent === "Reject",
        },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Will it take the whole day?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I didn't catch that."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    time: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "doublecheck",
            cond: (context) => !!context.nluResult.prediction.entities.length && context.nluResult.prediction.entities[0].category === "dateTime",
            actions: assign({
              time: (context) => context.nluResult.prediction.entities[0].resolutions[0].value,    //context.recResult[0].utterance,
            }),
          },

          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("What time is the meeting?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I didn't catch that."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    doublecheck: {
      initial: "prompt",
      on: { RECOGNISED: [
        {
        target: "confirm",
        cond: (context) => context.nluResult.prediction.topIntent === "Affirm",
        },
        {
          target: ".incorrect",
          cond: (context) => context.nluResult.prediction.topIntent === "Reject",
        },
        {
          target: ".nomatch"
        }
      ],
      TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Do you want me to create a meeting titled ${context.title}, on ${context.day}, ${speakTime(context.time)}?`,
          })),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch : {
          entry: say(
            "Sorry, I didn't catch that."
          ),
          on : { ENDSPEECH: "ask"},
        },
        incorrect: {
          entry: say(
            "I'm sorry, I misunderstood. We'll try again."
          ),
          on: { ENDSPEECH: "#appointment.welcome" },
        },
    },
    },
    confirm: {
      entry: send((context) => ({
        type: "SPEAK",
        value: "Ok, your meeting has been created.",
      })),
      on: { ENDSPEECH: "#root.dm.init" },
    },
  },
},
},
};

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());



