import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";
import { TIMESCALE_CA_PEM } from "@/lib/server/timescaleCa";
import { isUuid, tigerConnectionOptions } from "@/lib/server/tigerStore";

describe("tiger connection", () => {
  it("verifies TLS against public roots plus Timescale's CA, ignoring sslmode", () => {
    const { connectionString, ssl } = tigerConnectionOptions("postgres://u:p@abc.tsdb.cloud.timescale.com:34567/tsdb?sslmode=require");
    expect(connectionString).not.toMatch(/sslmode/);
    expect(connectionString).toMatch(/abc\.tsdb\.cloud\.timescale\.com:34567\/tsdb/);
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.servername).toBe("abc.tsdb.cloud.timescale.com");
    expect(ssl.ca).toContain(TIMESCALE_CA_PEM);
    expect((ssl.ca as string[]).length).toBe(rootCertificates.length + 1);
  });

  it("embeds a PEM certificate", () => {
    expect(TIMESCALE_CA_PEM).toMatch(/^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----$/);
  });

  it("treats non-uuid ids as not found", () => {
    expect(isUuid("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b")).toBe(true);
    expect(isUuid("does-not-exist")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
