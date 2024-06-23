import type { AccessToken } from "@spotify/web-api-ts-sdk";

export class TokenCache {
  data: Map<string, AccessToken> = new Map();

  setToken(token: AccessToken) {
    this.data.set("token", token);
  }

  getToken(): AccessToken | undefined {
    return this.data.get("token");
  }

  delToken() {
    this.data.delete("token");
  }
}
