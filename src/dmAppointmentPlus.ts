import { isContext } from "vm";
import { MachineConfig, send, Action, assign } from "xstate";

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

let Cheerful = `contour="(0%,-10%) (80%,+30%) (100%,-20%)"`

const speakTime = (time: string) => {
  if (time === "all day") {
    return "that lasts all day"
  } else {
    return `at <say-as interpret-as="time" format="hms24">${time}</say-as>`
  }
};

const getIntent = (context: SDSContext) => {
  return context.nluHypothesis.topIntent
};

const affirm = (context: SDSContext) => {
  return context.nluResult.prediction.topIntent === "Affirm"
}

const reject = (context: SDSContext) => {
  return context.nluResult.prediction.topIntent === "Reject"
}

const help = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  return u === "help"
}

const asrTreshold = (context: SDSContext) => {
  let confidence = context.asrHypothesis.confidence;
  if (confidence >= 0.7){
    return true
  } else { 
    return false
  }
};

/* const nluIntentTreshold = (context: SDSContext) => {
  let confidence = context.nluResult.prediction.intents[0].confidenceScore;
  if (confidence >= 0.7){
    return true
  } else { 
    return false
  }
}; */


export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  id: "appointment",
  initial: "idle",
  states: {
    help: {
      id: "help",
      entry: say(`This is a help message!`),
    on: { ENDSPEECH: "main.history" },
  },
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      on: {
        TTS_READY: "main", 
        CLICK: "main", 
      },
    },
    main: {
      entry: [assign({ promptcount: 0 }),
      assign({ nomatchcount: 0})],
      initial: "user",
      on: {
        RECOGNISED: {
          target: "help",
          cond: (context) => help(context)
        },
      },
      states: {
    history: {
      type: 'history',
      history: 'deep'
    },
    user: {
      id: "user",
      entry: [assign({ promptcount: 0 }),
        assign({ nomatchcount: 0})],
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#user.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#user.prompt.p2"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#welcome",
              cond: (context) => !!context.nluHypothesis.entities.length && context.nluHypothesis.entities[0].category === "username",
              actions: assign({
                username: (context) => context.nluHypothesis.entities[0].text.replace(/\.$/g, "")   
              }),
            },
            {
              target: "nomatch"
            },
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: say(`<prosody ${Cheerful}>Hello!</prosody> <prosody ${Cheerful}>What is your name?</prosody>`),
              on: { ENDSPEECH: "#user.ask" },
            },
            p2: {
              entry: say(`<prosody ${Cheerful}>What is your name?</prosody>`),
              on: { ENDSPEECH: "#user.ask" },
            },
            p3: {
              entry: say(`<prosody ${Cheerful}>Yo, what's your name?</prosody>`),
              on: { ENDSPEECH: "#user.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#user.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#user.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#user.ask" },
            },
          },
        },
      },
    },
    welcome: {
    id: "welcome", 
    entry: [assign({ promptcount: 0 }),
      assign({ nomatchcount: 0})],
    initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#welcome.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#welcome.prompt"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#famousPerson",
              cond: (context) => getIntent(context) === "famousPerson",
              actions: assign({
                person: (context) => {
                  return context.nluHypothesis.entities[0].text
                },
              })
            },       
            {
              target: "#meeting",
              cond: (context) => getIntent(context) === "meeting",
            },
            {
              target: "#goodbye",
              cond: (context) => getIntent(context) === "Reject",
            },
            {
              target: "nomatch",
            }, 
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry:
                send((context) => ({
                  type: "SPEAK",
                  value: `<emphasis level="strong"><prosody pitch="+8%" ${Cheerful}>Welcome</prosody></emphasis> <prosody pitch="-5%">${context.username}</prosody>! How can I help you?`,
                })),
              on: { ENDSPEECH: "#welcome.ask" },
            },
            p2: {
              entry: say(`How can I help you?`),
              on: { ENDSPEECH: "#welcome.ask" },
            },
            p3: {
              entry: say(`Can I help you?`),
              on: { ENDSPEECH: "#welcome.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#welcome.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#welcome.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#welcome.ask" },
            },
          },
        },
        getIntent: {

        }
      },
    },
 famousPerson: {
  id: "famousPerson",
      initial: "info",
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
            on: {ENDSPEECH: "#appointment.main.meetThem"},  
          },
          failure: {
            entry: send((context) => ({
              type: "SPEAK",
              value: `I'm sorry, an error seems to have occurred. Let's try again.`, 
            })),
            on: {ENDSPEECH: "#appointment.main.welcome"},  
          },
          noinfo: {
            entry: send((context) => ({
              type: "SPEAK",
              value: `I'm sorry, I don't know anything about them. Can I do something else for you?`, 
            })),
            on: {ENDSPEECH: "#appointment.main.welcome.ask"},  
          },
      },
    }, 
    meetThem: {
      id: "meetThem",
      entry: [assign({ promptcount: 0 }),
        assign({ nomatchcount: 0})],
      initial: "prompt",
      on: { 
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#meetThem.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#meetThem.prompt"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#meeting.day",
              cond: (context) => getIntent(context) === "Affirm",
              actions: assign({
                title: (context) => `Meeting with ${context.person}`,
              }),
            },
            {
              target: "#goodbye",
              cond: (context) => getIntent(context) === "Reject",
            },
            {
              target: "nomatch"
            },
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: say(`Would you like to <prosody rate="slow" pitch="+20%">meet</prosody> <prosody rate="+10%">them?</prosody>`),
              on: { ENDSPEECH: "#meetThem.ask" },
            },
            p2: {
              entry: say(`Would you?`),
              on: { ENDSPEECH: "#meetThem.ask" },
            },
            p3: {
              entry:  send((context) => ({
                  type: "SPEAK",
                  value: `Hey, do you want to meet ${context.person} or not?`, 
                })),
              on: { ENDSPEECH: "#meetThem.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meetThem.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meetThem.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#meetThem.ask" },
            },
          },
        },
      },
    },
    goodbye: {
      id: "goodbye",
      entry: send((context) => ({
        type: "SPEAK",
        value: `Ok, <prosody pitch="x-high" rate="+10%" ${Cheerful}>goodbye</prosody>.`,
      })),
      on: { ENDSPEECH: "#appointment" },
    }, 
    meeting: {
      id: "meeting",
      initial: "title",
      states: {
      title: {
        entry: [assign({ promptcount: 0 }),
          assign({ nomatchcount: 0})],
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#meeting.title.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#meeting.title.prompt"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#meeting.day",
              actions: assign({
                title: (context) => context.asrHypothesis.utterance.replace(/\.$/g, "")
              })
            },
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: say(`Ok, let's create a meeting. What is it about?`),
              on: { ENDSPEECH: "#meeting.title.ask" },
            },
            p2: {
              entry: say(`What is it about?`),
              on: { ENDSPEECH: "#meeting.title.ask" },
            },
            p3: {
              entry: say(`What is the meeting about?`),
              on: { ENDSPEECH: "#meeting.title.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
      },
    },
    day: {
      entry: [assign({ promptcount: 0 }),
        assign({ nomatchcount: 0})],
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#meeting.day.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#meeting.day.prompt"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#meeting.allday",
              cond: (context) => !!context.nluHypothesis.entities.length && context.nluHypothesis.entities[0].category === "dateTime",
              actions: assign({
                day: (context) => context.nluHypothesis.entities[0].resolutions[0].value,
              }),
            },
            {
              target: "nomatch",
            },
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: say(`What day is the meeting?`),
              on: { ENDSPEECH: "#meeting.day.ask" },
            },
            p2: {
              entry: say(`What day is it?`),
              on: { ENDSPEECH: "#meeting.day.ask" },
            },
            p3: {
              entry: say(`What day?`),
              on: { ENDSPEECH: "#meeting.day.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.day.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.day.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#meeting.day.ask" },
            },
          },
        },
      },
    },
    allday: {
      entry: [assign({ promptcount: 0 }),
        assign({ nomatchcount: 0})],
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#meeting.allday.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#meeting.allday.prompt"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#meeting.doublecheck",
              cond: (context) => getIntent(context) === "Affirm",
              actions: assign({
                time: (context) => "all day",
              }),
            },
            {
              target: "#meeting.time",
              cond: (context) => getIntent(context) === "Reject",
          },
            {
              target: "nomatch",
            },
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: say(`Will it take the whole day?`),
              on: { ENDSPEECH: "#meeting.allday.ask" },
            },
            p2: {
              entry: say(`Will it take all day?`),
              on: { ENDSPEECH: "#meeting.allday.ask" },
            },
            p3: {
              entry: say(`Will the meeting last the whole day?`),
              on: { ENDSPEECH: "#meeting.allday.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.allday.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.allday.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#meeting.allday.ask" },
            },
          },
        },
      },
    },
    time: {
      entry: [assign({ promptcount: 0 }),
        assign({ nomatchcount: 0})],
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "#help",
              cond: (context) => help(context),
          },
          {target: ".confidenceCheck",
          actions: [
            assign({ nluHypothesis: (context) => context.nluResult.prediction}),
            assign({ asrHypothesis: (context) => context.recResult[0]}),
          ],
        },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => affirm(context),
              },
              {
                target: ".apologise",
                cond: (context) => reject(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: ".prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#meeting.time.transition",
                cond: (context) => asrTreshold(context) },
                {target: "prompt"}
              ],
            },
            prompt: {
              entry: [ send((context) => ({
                type: "SPEAK",
                value: `Did you say ${context.asrHypothesis.utterance}?`,
              })),
                assign({promptcount: (context) => 0 }) ],
              on: { ENDSPEECH: "ask"}
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            apologise: {
              entry: say("I'm sorry!"),
              on: {ENDSPEECH: "#meeting.time.prompt"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
              target: "#meeting.doublecheck",
              cond: (context) => !!context.nluHypothesis.entities.length && context.nluHypothesis.entities[0].category === "dateTime",
              actions: assign({
                time: (context) => context.nluHypothesis.entities[0].resolutions[0].value,    
              }),
            },
  
            {
              target: "nomatch",
            },
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: say(`What time is the meeting?`),
              on: { ENDSPEECH: "#meeting.time.ask" },
            },
            p2: {
              entry: say(`What time is it?`),
              on: { ENDSPEECH: "#meeting.time.ask" },
            },
            p3: {
              entry: say(`When is the meeting?`),
              on: { ENDSPEECH: "#meeting.time.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.time.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.time.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#meeting.time.ask" },
            },
          },
        },
      },
    },
    doublecheck: {
      entry: [assign({ promptcount: 0 }),
        assign({ nomatchcount: 0})],
      initial: "prompt",
      on: { RECOGNISED: [
        {
          target: "#help",
            cond: (context) => help(context),
        },
        {target: ".confidenceCheck",
        actions: [
          assign({ nluHypothesis: (context) => context.nluResult.prediction}),
          assign({ asrHypothesis: (context) => context.recResult[0]}),
        ],
      },
      ],
      TIMEOUT: ".prompt",
      },
      states: {
        confidenceCheck: {
          initial: "treshold",
          on: {
            RECOGNISED: [
              {
                target: "transition",
                cond: (context) => asrTreshold(context),
              },
              {
                target: ".nomatch"
              },
            ],
            TIMEOUT: "#meeting.doublecheck.prompt",
          },
          states: {
            treshold: {
              always: [
                {target: "#meeting.doublecheck.transition",
                cond: (context) => asrTreshold(context) },
                {target: "nomatch"}
              ],
            },
            nomatch: {
              entry: say("I'm sorry, could you repeat that?"),
              on: {ENDSPEECH: "ask"}
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        transition: {
          always: [
            {
            target: "#meeting.confirm",
            cond: (context) => getIntent(context) === "Affirm",
            },
            {
              target: "incorrect",
              cond: (context) => getIntent(context) === "Reject",
            },
            {
              target: "nomatch"
            }
          ]
        },
        prompt: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ promptcount: (context) => context.promptcount+1 }),
              always: [
                {
                  target: "p3",
                  cond: (context) => context.promptcount === 2,
                },
                {
                  target: "p2",
                  cond: (context) => context.promptcount === 1,
                },
                {
                  target: "p1",
                  cond: (context) => context.promptcount === 0,
                },
                "#appointment.init"
              ],
            },
            p1: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Do you want me to create a meeting titled <emphasis><prosody rate="slow">${context.title}</prosody></emphasis>, on <say-as interpret-as="date" format="ymd">${context.day}</say-as>, ${speakTime(context.time)}?`,
              })),
              on: { ENDSPEECH: "#meeting.doublecheck.ask" },
            },
            p2: {
              entry: say(`Is that correct?`),
              on: { ENDSPEECH: "#meeting.doublecheck.ask" },
            },
            p3: {
              entry: say(`Was it correct?`),
              on: { ENDSPEECH: "#meeting.doublecheck.ask" },
            },
          },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          initial: "choose",
          states: {
            choose: {
              exit: assign({ nomatchcount: (context) => context.nomatchcount+1 }),
              always: [
                {
                  target: "n3",
                  cond: (context) => context.nomatchcount === 2,
                },
                {
                  target: "n2",
                  cond: (context) => context.nomatchcount === 1,
                },
                {
                  target: "n1",
                  cond: (context) => context.nomatchcount === 0,
                },
                "#appointment.init"
              ],
            },
            n1: {
              entry: say(`I'm sorry, I don't understand. Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.doublecheck.ask" },
            },
            n2: {
              entry: say(`Could <emphasis level="none">you</emphasis> <prosody rate="-10%" ${Cheerful}><emphasis>repeat</emphasis></prosody> that?`),
              on: { ENDSPEECH: "#meeting.doublecheck.ask" },
            },
            n3: {
              entry: say(`I'm sorry, I still don't understand.`),
              on: { ENDSPEECH: "#meeting.doublecheck.ask" },
            },
          },
        },
        incorrect: {
          entry: say(
            `I'm sorry, I misunderstood. We'll try again.`
          ),
          on: { ENDSPEECH: "#appointment.main.welcome.prompt.p2" },
        },
    },
    },
    confirm: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `Ok, your meeting has been created.`,
      })),
      on: { ENDSPEECH: "#root.dm.init" },
    },
  },
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



