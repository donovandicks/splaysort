import type { Playlist, TrackItem } from "@spotify/web-api-ts-sdk";
import type { ComparableFeature, Song, Tracklist } from "./spotify";
import { Spotify } from "./spotify";

type AtLeastOne<T, Keys extends keyof T> = {
  [K in Keys]-?: Partial<T> & { [P in K]-?: T[P] };
}[Keys];

type FinalTrack = {
  id: string;
  name: string;
  artists: string[];
  score?: number;
  scoringFunc?: ScoringFunctionType;
} & AtLeastOne<Record<ComparableFeature, number>, ComparableFeature>;

const averageFeatures = (song: Song, feats: ComparableFeature[]): number =>
  Math.round(
    (feats.reduce((acc, f) => acc + (song[f] as number), 0) / feats.length) *
      10000
  ) / 10000;

const multiplyFeatures = (song: Song, feats: ComparableFeature[]): number =>
  Math.round(feats.reduce((acc, f) => acc * (song[f] as number), 1) * 10000) /
  10000;

const ScoringFunctions = {
  average: averageFeatures,
  multiply: multiplyFeatures,
} as const;

export type ScoringFunctionType = keyof typeof ScoringFunctions;

export class TracklistFeatures {
  client: Spotify;
  playlist?: Playlist<TrackItem> = undefined;
  tracklist: Tracklist = {};
  tracklistFeatures: Song[] = [];

  constructor(client: Spotify) {
    this.client = client;
  }

  static async build(
    client: Spotify,
    playlistName: string
  ): Promise<TracklistFeatures> {
    const tlf = new TracklistFeatures(client);
    const playlists = await tlf.client.getAllPlaylists();
    const playlist = playlists.filter((p) => p.name === playlistName)[0];
    if (playlist === undefined) {
      throw new Error(
        `Playlist ${playlistName} not found for user ${tlf.client.userId}`
      );
    }

    tlf.playlist = playlist;
    tlf.tracklist = await tlf.client.getAllPlaylistTracks(playlist);
    tlf.tracklistFeatures = await tlf.client.getTracklistFeatures(
      playlist,
      tlf.tracklist
    );
    return tlf;
  }

  getTrackUri(trackId: string): string {
    return this.tracklist[trackId].uri;
  }

  getUrisForTracks(trackIds: string[]): string[] {
    return trackIds.map((tid) => this.getTrackUri(tid));
  }

  sortBySingleFeature(featureName: ComparableFeature): FinalTrack[] {
    return this.tracklistFeatures
      .map((s) => {
        return {
          id: s.id,
          name: s.name,
          artists: s.artists,
          [featureName]: s[featureName] as number,
        } as FinalTrack;
      })
      .sort((a, b) => (a[featureName]! < b[featureName]! ? 1 : -1));
  }

  sortByFeatureCombo = (
    feats: Array<ComparableFeature>,
    scoringFunc: ScoringFunctionType
  ): FinalTrack[] => {
    return this.tracklistFeatures
      .map((s) => {
        return {
          id: s.id,
          name: s.name,
          artists: s.artists,
          score: ScoringFunctions[scoringFunc](s, feats),
          ...feats.reduce((acc, f) => {
            acc[f] = s[f];
            return acc;
          }, {} as { [key in ComparableFeature]: number }),
        } as FinalTrack;
      })
      .sort((a, b) => (a.score! < b.score! ? 1 : -1));
  };

  async sortByFeature(
    feats: ComparableFeature[],
    scoringFunc?: ScoringFunctionType
  ): Promise<string[]> {
    const sorted =
      feats.length > 1
        ? this.sortByFeatureCombo(feats, scoringFunc!)
        : this.sortBySingleFeature(feats[0]);
    await this.writeOut(feats, sorted, scoringFunc);
    return sorted.map((s) => s.id);
  }

  async writeOut(
    feats: ComparableFeature[],
    data: Object,
    scoringFunc?: ScoringFunctionType
  ): Promise<void> {
    const fileName = scoringFunc
      ? `${feats.join("+")}-${scoringFunc}.json`
      : `${feats.join("+")}.json`;
    const path = `playlist-${this.playlist!.name}/${fileName}`;
    await Bun.write(path, JSON.stringify(data, undefined, 2));
    console.log(`Wrote data to ${path}`);
  }
}
