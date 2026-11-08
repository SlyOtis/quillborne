import { getFileUrl, postFile } from './api'
import type { SoundClip, SoundBoard } from './character.types';


function getDuration(audioFile: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(audioFile);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    });
    audio.src = url;
  });
}

export async function postSoundClip(name: string, audioFile: File): Promise<SoundClip> {
  const [{ url: address }, duration] = await Promise.all([postFile(audioFile, { kind: 'user' }), getDuration(audioFile)]);

  return {
    id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name || audioFile.name.replace(/\.[^/.]+$/, ""),
    address,
    volume: 1.0,
    ...(duration === undefined ? {} : { duration }),
    created_at: new Date().toISOString()
  };
}

export async function playSoundClip(clip: SoundClip): Promise<void> {
  const url = await getFileUrl(clip.address);
  if (!url) throw new Error(`${clip.name} is not on this machine.`);

  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = clip.volume;
    
    audio.addEventListener('ended', () => resolve());
    audio.addEventListener('error', () => reject(new Error('Failed to play sound')));
    
    audio.play().catch(reject);
  });
}

export function createDefaultSoundBoard(): SoundBoard {
  return {
    id: `soundboard_${Date.now()}`,
    name: 'My Sound Board',
    clips: []
  };
}

export function addClipToSoundBoard(soundBoard: SoundBoard, clip: SoundClip): SoundBoard {
  return {
    ...soundBoard,
    clips: [...soundBoard.clips, clip]
  };
}

export function removeClipFromSoundBoard(soundBoard: SoundBoard, clipId: string): SoundBoard {
  return {
    ...soundBoard,
    clips: soundBoard.clips.filter(clip => clip.id !== clipId)
  };
}

export function updateClipInSoundBoard(soundBoard: SoundBoard, clipId: string, updates: Partial<SoundClip>): SoundBoard {
  return {
    ...soundBoard,
    clips: soundBoard.clips.map(clip => 
      clip.id === clipId ? { ...clip, ...updates } : clip
    )
  };
}