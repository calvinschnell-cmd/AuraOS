/**
 * Timescale Inc internal root CA (CN=ca.timescale.com, valid to 2027-10-20,
 * SHA-256 06:5A:75:0D:...:34:64:57). New Tiger Cloud services start on a
 * certificate from this CA until their public (Google / ZeroSSL) one is
 * issued; it is trusted in addition to the normal public roots so full
 * verification works both before and after that swap. Public, not a secret.
 */
export const TIMESCALE_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIBpzCCAUygAwIBAgIQfH0seuAygeQX2lTU/eVncDAKBggqhkjOPQQDAjAzMRYw
FAYDVQQKEw1UaW1lc2NhbGUgSW5jMRkwFwYDVQQDExBjYS50aW1lc2NhbGUuY29t
MB4XDTI1MDEyMzE1NDMzOVoXDTI3MTAyMDE1NDMzOVowMzEWMBQGA1UEChMNVGlt
ZXNjYWxlIEluYzEZMBcGA1UEAxMQY2EudGltZXNjYWxlLmNvbTBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABKRa3FQeN67oUZK6PdG7FtZKYSv1WgJrZ64mfX9pLNlE
EeVzCnHIAcE9xsQ5j/gccgu9oyiJ/CcLPlkzBHe34M2jQjBAMA4GA1UdDwEB/wQE
AwICpDAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBTZ/kgiRgLuL0Tg7eYuwBps
25fwzDAKBggqhkjOPQQDAgNJADBGAiEAvH4JAMgGPL/BSARg47GxjBKJ9Mz+Q3CI
i21+5khjUHECIQCH1kzoKAKTnrkCuifWW9K0CzqXPLSjJBIh3jH2aaWZFQ==
-----END CERTIFICATE-----`;
