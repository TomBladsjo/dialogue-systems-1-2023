
import { MachineConfig, send, Action, assign } from "xstate";


export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  initial: "idle",
  states: {
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      on: {
        TTS_READY: "welcome",
        CLICK: "welcome",
      },
    },
    welcome: {
        initial: "prompt",
        on: {
            ENDSPEECH: "idle"
        },
        states: {
        prompt: {
        entry: send({
        // entry actions, send SPEAK event
        type: "SPEAK",
        value: `<prosody range="x-high">
        I have your <emphasis level="strong"><prosody rate="-5%">calendar</prosody></emphasis> <emphasis level="reduced"><prosody pitch="-5%" volume="-10%">open</prosody></emphasis>. 
        <break strength="weak" /> 
        For what <emphasis level="strong"><prosody rate="-10%">date</prosody></emphasis>? 
        <break strength="medium" /> 
        What <emphasis level="strong"><prosody rate="slow">time</prosody></emphasis> would you like to <emphasis level="moderate"><prosody rate="-5%">start</prosody></emphasis>? 
        <break strength="medium" /> 
        How much time do you want to <emphasis level="reduced"><prosody rate="default" volume="soft">block</prosody></emphasis> <emphasis level="strong"><prosody rate="slow">out</prosody></emphasis>? 
        <break strength="medium" />
        What shall we <emphasis level="strong">call</emphasis> this? 
        <break strength="medium" />
        Ok. I have created a meeting<break time="50ms" /> <emphasis level="none">titled</emphasis> <prosody rate="-5%"><say-as interpret-as="characters" format="characters">ABC</say-as></prosody> on Friday from <say-as interpret-as="time" format="hms12">06:00 PM</say-as> to <say-as interpret-as="time" format="hms12">09:00 PM</say-as>.
        <break strength="medium" />
 Is that correct?</prosody>`
        
        /* `I have your calendar open. 
        <break strength="medium"/> 
        For what date? 
        <break strength="medium"/> 
        What time would you like to start? 
        <break strength="medium"/> 
        How much time do you want to block out? 
        <break strength="medium"/> 
        What shall we call this? 
        <break strength="medium"/>
        Ok. I have created a meeting titled <say-as interpret-as="characters" format="characters">ABC</say-as> on Friday, 
        from <say-as interpret-as="time" format="hms12">06:00 PM</say-as> to <say-as interpret-as="time" format="hms12">09:00 PM</say-as>.
        <break strength="medium"/>
        Is that correct?` */,
        }),
    },

    },
    },
    test: {
      initial: "",
      states: {
   
  },
},
},
};
