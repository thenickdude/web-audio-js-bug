import fs from "fs";
import {StreamAudioContext, OfflineAudioContext, encoder, api} from "@descript/web-audio-js";

// Polyfill the Web Audio API for Tone's benefit
for (let name in api) {
    if (Object.prototype.hasOwnProperty.call(api, name)) {
        global[name] = api[name];
    }
}

global.DOMException = Error;
global.AudioContext = StreamAudioContext;
global.OfflineAudioContext = OfflineAudioContext;

// Since Tone's core/context/AudioContext::hasAudioContext requires AudioContext as a property on "self"
global.self = global;

// Since standardized-audio-context looks at window explicitly:
global.window = global;

let
    // Imported dynamically so it's loaded after the polyfills are installed
    Tone = (await import("tone")).default,
    bpm = 60,
    songLength = 120;

/**
 * @param {string} url
 * @return {Promise<AudioBuffer>}
 */
function readAudioBuffer(url) {
    let
        buffer = fs.readFileSync(url);

    return Tone.getContext().decodeAudioData(buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

/**
 * @return {Promise<Transport>}
 */
async function play() {
    await Tone.start();

    const
        highPass = new Tone.Filter(100, 'highpass').toDestination(),
        chorus = new Tone.Chorus(2, 2.4, 1.2).connect(highPass),

        leadSampler = new Tone.Sampler({
            urls: {
                // pinkyfinger, CC BY 2.5 <https://creativecommons.org/licenses/by/2.5>, via Wikimedia Commons
                'D3': await readAudioBuffer('./instrument.wav')
            }
        }),

        context = Tone.getContext(),
        transport = context.transport;

    transport.bpm.value = bpm;

    leadSampler.volume.value = -8;
    leadSampler.connect(chorus);

    chorus.start();

    transport.scheduleRepeat(
        time => leadSampler.triggerAttackRelease(Tone.Frequency(50, 'midi'), 2, time, 1),
        '2n'
    );

    transport.start();
}

let
    startTime;

Tone.Offline(
    async () => {
        console.log(`Song length ${songLength}s`);
        console.log("Rendering...");

        startTime = +new Date();
        await play();
    },
    songLength
)
    .then(async buffer => {
        console.log("Done in " + ((+new Date() - startTime ) / 1000).toFixed(1) + " seconds");

        return encoder.encode(buffer, {type: 'wav'});
    })
    .then(arrayBuffer => {
        fs.writeFileSync('output.wav', Buffer.from(arrayBuffer), {encoding: null});

        console.log("Wrote to output.wav");

        process.exit(0);
    });
