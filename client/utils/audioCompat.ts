import {
  createAudioPlayer,
  setAudioModeAsync as setExpoAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";

export type AVPlaybackStatus = {
  isLoaded: boolean;
  didJustFinish: boolean;
};

type LegacyAudioMode = {
  allowsRecordingIOS?: boolean;
  playsInSilentModeIOS?: boolean;
  staysActiveInBackground?: boolean;
  shouldDuckAndroid?: boolean;
  playThroughEarpieceAndroid?: boolean;
  interruptionModeIOS?: unknown;
  interruptionModeAndroid?: unknown;
};

type LegacyPlaybackOptions = {
  shouldPlay?: boolean;
  volume?: number;
};

export enum InterruptionModeIOS {
  DoNotMix = 1,
  DuckOthers = 2,
}

export enum InterruptionModeAndroid {
  DoNotMix = 1,
  DuckOthers = 2,
}

export namespace Audio {
  export const InterruptionModeIOS = {
    DoNotMix: 1,
    DuckOthers: 2,
  } as const;

  export const InterruptionModeAndroid = {
    DoNotMix: 1,
    DuckOthers: 2,
  } as const;

  export async function setAudioModeAsync(mode: LegacyAudioMode): Promise<void> {
    const wantsDuck =
      mode.shouldDuckAndroid ||
      mode.interruptionModeIOS === InterruptionModeIOS.DuckOthers ||
      mode.interruptionModeAndroid === InterruptionModeAndroid.DuckOthers;
    await setExpoAudioModeAsync({
      playsInSilentMode: mode.playsInSilentModeIOS ?? true,
      shouldPlayInBackground: mode.staysActiveInBackground ?? false,
      interruptionMode: wantsDuck ? "duckOthers" : "doNotMix",
    });
  }

  export class Sound {
    private subscription: { remove(): void } | null = null;

    private constructor(private readonly player: AudioPlayer) {}

    static async createAsync(
      source: Parameters<typeof createAudioPlayer>[0],
      options: LegacyPlaybackOptions = {},
    ): Promise<{ sound: Sound }> {
      const player = createAudioPlayer(source);
      if (typeof options.volume === "number") player.volume = options.volume;
      const sound = new Sound(player);
      if (options.shouldPlay) player.play();
      return { sound };
    }

    setOnPlaybackStatusUpdate(listener: (status: AVPlaybackStatus) => void): void {
      this.subscription?.remove();
      this.subscription = (this.player as any).addListener("playbackStatusUpdate", (status: AudioStatus) => {
        listener({
          isLoaded: status.isLoaded,
          didJustFinish: status.didJustFinish,
        });
      });
    }

    async stopAsync(): Promise<void> {
      this.player.pause();
      await this.player.seekTo(0);
    }

    async unloadAsync(): Promise<void> {
      this.subscription?.remove();
      this.subscription = null;
      (this.player as any).release();
    }
  }
}