import { describe, expect, it, vi } from "vitest";

import { buildSslOptions } from "./db-ssl";

describe("buildSslOptions", () => {
  it("keeps TLS off unless DB_SSL is true", () => {
    expect(buildSslOptions({})).toBeUndefined();
    expect(buildSslOptions({ DB_SSL: "false" })).toBeUndefined();
    expect(buildSslOptions({ DB_SSL: "1" })).toBeUndefined();
  });

  it("always validates the chain and the hostname by default", () => {
    expect(buildSslOptions({ DB_SSL: "true" })).toEqual({
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      verifyIdentity: true,
    });
  });

  it("loads the CA file and can skip only the hostname check", () => {
    const readCa = vi.fn(() => "-----BEGIN CERTIFICATE-----");

    expect(
      buildSslOptions(
        {
          DB_SSL: " TRUE ",
          DB_SSL_CA: "/run/secrets/db-ca.pem",
          DB_SSL_VERIFY_HOSTNAME: "false",
        },
        readCa,
      ),
    ).toEqual({
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      verifyIdentity: false,
      ca: "-----BEGIN CERTIFICATE-----",
    });

    expect(readCa).toHaveBeenCalledWith("/run/secrets/db-ca.pem");
  });
});
