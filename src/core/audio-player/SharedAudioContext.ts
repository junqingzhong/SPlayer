import type { IExtendedAudioContext } from "./BaseAudioPlayer";

let sharedContext: IExtendedAudioContext | null = null;

export const getSharedAudioContext = (): IExtendedAudioContext => {
  if (!sharedContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedContext = new AudioContextClass() as IExtendedAudioContext;
  }
  return sharedContext;
};
