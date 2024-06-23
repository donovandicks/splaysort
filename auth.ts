import type {
  AccessToken,
  IAuthStrategy,
  SdkConfiguration,
} from "@spotify/web-api-ts-sdk";
import { TokenCache } from "./cache";

export class LocalAuthStrategy implements IAuthStrategy {
  tokenCache: TokenCache;

  constructor(cache: TokenCache) {
    this.tokenCache = cache;
  }

  setConfiguration(configuration: SdkConfiguration): void {}

  async getOrCreateAccessToken(): Promise<AccessToken> {
    const existing = this.tokenCache.getToken();
    if (!existing) {
      throw new Error("Failed to retrieve access token");
    }
    return existing;
  }

  async getAccessToken(): Promise<AccessToken | null> {
    return this.tokenCache.getToken() || null;
  }

  removeAccessToken(): void {
    this.tokenCache.delToken();
  }
}
