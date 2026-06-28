export interface SubtitleBlock {
  id: string; // Unique client-side ID for list item tracking & react keys
  startTime: number; // Start time of dialogue in seconds
  endTime: number; // End time of dialogue in seconds
  chinese: string; // Transcribed Chinese text
  burmese: string; // Translated Burmese text
}

export type SubtitleTone = 'poetic' | 'dramatic' | 'colloquial' | 'modern';

export interface BurnConfig {
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundColor: string;
  verticalOffset: number; // percentage from bottom (e.g. 10)
}
