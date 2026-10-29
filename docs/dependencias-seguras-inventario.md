# Inventario inicial de dependencias

Fecha: 2026-10-29. Base: c24b764. Comando: npm audit --json (salida 1).

57 paquetes afectados: 5 críticos, 25 altos, 18 moderados y 9 bajos.
La clasificación producción/desarrollo procede de las ubicaciones del lockfile, no de una afirmación de explotabilidad. Una corrección marcada incompatible por npm puede ser un salto de versión mayor, un cambio incompatible 0.x o incluso un downgrade fuera del rango: no se aplica automáticamente. Compatible es la propuesta de npm, pendiente de verificar antigüedad y compatibilidad antes de instalar.

| Paquete | Versión instalada | Severidad | Relación | Alcance | Corrección propuesta por npm |
|---|---|---|---|---|---|
| @babel/core | 7.26.0 | low | Transitiva | Desarrollo | Compatible según npm |
| @babel/helpers | 7.26.0 | moderate | Transitiva | Desarrollo | Compatible según npm |
| @esbuild-kit/core-utils | 3.3.2 | moderate | Transitiva | Desarrollo | drizzle-kit@0.31.11 (incompatible / fuera del rango actual) |
| @esbuild-kit/esm-loader | 2.6.5 | moderate | Transitiva | Desarrollo | drizzle-kit@0.31.11 (incompatible / fuera del rango actual) |
| @sendgrid/client | 8.1.5 | low | Transitiva | Producción | Compatible según npm |
| @sendgrid/helpers | 8.0.0 | low | Transitiva | Producción | @sendgrid/mail@6.5.2 (incompatible / fuera del rango actual) |
| @sendgrid/mail | 8.1.5 | low | Directa | Producción | @sendgrid/mail@6.5.2 (incompatible / fuera del rango actual) |
| @tailwindcss/typography | 0.5.15 | moderate | Directa | Desarrollo | @tailwindcss/typography@0.5.4 (incompatible / fuera del rango actual) |
| @vitest/coverage-v8 | 4.1.10 | moderate | Directa | Desarrollo | Compatible según npm |
| @vitest/mocker | 4.1.10 | moderate | Transitiva | Desarrollo | Compatible según npm |
| axios | 1.10.0 | high | Transitiva | Producción | Compatible según npm |
| body-parser | 1.20.3 | high | Transitiva | Producción | Compatible según npm |
| brace-expansion | 1.1.12, 2.0.1 | high | Transitiva | Producción | Compatible según npm |
| browserslist | 4.24.2 | high | Transitiva | Desarrollo | Compatible según npm |
| cookie | 0.4.0 | low | Transitiva | Producción | csurf@1.2.2 (incompatible / fuera del rango actual) |
| csurf | 1.11.0 | low | Directa | Producción | csurf@1.2.2 (incompatible / fuera del rango actual) |
| deepmerge | 4.3.1 | low | Transitiva | Producción | @sendgrid/mail@6.5.2 (incompatible / fuera del rango actual) |
| dompurify | 3.2.6 | high | Transitiva | Producción | Compatible según npm |
| drizzle-kit | 0.30.4 | moderate | Directa | Desarrollo | drizzle-kit@0.31.11 (incompatible / fuera del rango actual) |
| drizzle-orm | 0.39.1 | high | Directa | Producción | drizzle-orm@0.45.4 (incompatible / fuera del rango actual) |
| esbuild | 0.18.20, 0.19.12, 0.23.1, 0.21.5 | moderate | Transitiva | Desarrollo | drizzle-kit@0.31.11 (incompatible / fuera del rango actual) |
| exceljs | 4.4.0 | moderate | Directa | Producción | exceljs@3.4.0 (incompatible / fuera del rango actual) |
| express | 4.21.2 | high | Directa | Producción | Compatible según npm |
| express-brute | 1.0.1 | critical | Directa | Producción | Sin corrección en npm audit |
| express-session | 1.18.1 | low | Directa | Producción | Compatible según npm |
| express-validator | 7.2.1 | moderate | Directa | Producción | Compatible según npm |
| fflate | 0.8.2 | moderate | Transitiva | Producción | Compatible según npm |
| follow-redirects | 1.15.9 | moderate | Transitiva | Producción | Compatible según npm |
| form-data | 4.0.3 | critical | Transitiva | Producción | Compatible según npm |
| glob | 10.4.5 | high | Transitiva | Producción | Compatible según npm |
| jspdf | 3.0.1 | critical | Directa | Producción | Compatible según npm |
| jws | 3.2.2 | high | Transitiva | Producción | Compatible según npm |
| lodash | 4.17.21 | high | Transitiva | Producción | Compatible según npm |
| minimatch | 3.1.2, 9.0.5, 5.1.6 | high | Transitiva | Producción | Compatible según npm |
| multer | 2.0.1 | high | Directa | Producción | Compatible según npm |
| nanoid | 3.3.17 | high | Transitiva | Producción | Compatible según npm |
| node-forge | 1.3.1 | high | Directa | Producción | Compatible según npm |
| on-headers | 1.0.2 | low | Transitiva | Producción | Compatible según npm |
| path-to-regexp | 0.1.12 | high | Transitiva | Producción | Compatible según npm |
| picomatch | 2.3.1 | high | Transitiva | Producción | Compatible según npm |
| postcss-selector-parser | 6.0.10, 6.1.2 | moderate | Transitiva | Producción y desarrollo | @tailwindcss/typography@0.5.4 (incompatible / fuera del rango actual) |
| proxy-addr | 2.0.7 | critical | Transitiva | Producción | Compatible según npm |
| qs | 6.13.0 | moderate | Transitiva | Producción | Compatible según npm |
| rollup | 4.24.4 | high | Transitiva | Desarrollo | Compatible según npm |
| source-map-js | 1.2.1 | high | Transitiva | Producción | Compatible según npm |
| tmp | 0.2.3 | high | Transitiva | Producción | Compatible según npm |
| tsx | 4.19.2 | moderate | Directa | Desarrollo | Compatible según npm |
| underscore | 1.8.3 | critical | Transitiva | Producción | Sin corrección en npm audit |
| uuid | 8.3.2 | moderate | Transitiva | Producción | exceljs@3.4.0 (incompatible / fuera del rango actual) |
| validator | 13.12.0 | high | Transitiva | Producción | Compatible según npm |
| vite | 5.4.19, 8.2.0 | high | Directa | Desarrollo | Compatible según npm |
| vitest | 4.1.10 | moderate | Directa | Desarrollo | Compatible según npm |
| ws | 8.18.3 | high | Directa | Producción | Compatible según npm |
| xlsx | 0.18.5 | high | Directa | Producción | Sin corrección en npm audit |
| yaml | 2.6.0 | moderate | Transitiva | Producción | Compatible según npm |
| zod | 3.25.76 | high | Directa | Producción | zod@4.6.7 (incompatible / fuera del rango actual) |
| zod-validation-error | 3.4.0 | high | Directa | Producción | zod-validation-error@5.0.0 (incompatible / fuera del rango actual) |

## Avisos individuales y dependencias causantes

### @babel/core

- low: @babel/core: Arbitrary File Read via sourceMappingURL Comment. Rango afectado: <=7.29.0. [Aviso](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8).

### @babel/helpers

- moderate: Babel has inefficient RegExp complexity in generated code with .replace when transpiling named capturing groups. Rango afectado: <7.26.10. [Aviso](https://github.com/advisories/GHSA-968p-4wvh-cqc8).

### @esbuild-kit/core-utils

- Riesgo heredado de esbuild.

### @esbuild-kit/esm-loader

- Riesgo heredado de @esbuild-kit/core-utils.

### @sendgrid/client

- Riesgo heredado de @sendgrid/helpers.

### @sendgrid/helpers

- Riesgo heredado de deepmerge.

### @sendgrid/mail

- Riesgo heredado de @sendgrid/client.
- Riesgo heredado de @sendgrid/helpers.

### @tailwindcss/typography

- Riesgo heredado de postcss-selector-parser.

### @vitest/coverage-v8

- Riesgo heredado de vitest.

### @vitest/mocker

- moderate: Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock. Rango afectado: >=2.1.0 <4.1.11. [Aviso](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- moderate: Vitest: Code injection via unauthenticated manual mock registration. Rango afectado: >=2.1.0-beta.7 <4.1.12. [Aviso](https://github.com/advisories/GHSA-qxg6-89mg-rqv8).

### axios

- high: Axios is vulnerable to DoS attack through lack of data size check. Rango afectado: >=1.0.0 <1.12.0. [Aviso](https://github.com/advisories/GHSA-4hjh-wcwx-xvwj).
- moderate: Axios has a NO_PROXY Hostname Normalization Bypass that Leads to SSRF. Rango afectado: >=1.0.0 <1.15.0. [Aviso](https://github.com/advisories/GHSA-3p68-rc4w-qgx5).
- moderate: Axios: Authentication Bypass via Prototype Pollution Gadget in `validateStatus` Merge Strategy. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-w9j2-pvgh-6h63).
- high: Axios: Incomplete Fix for CVE-2025-62718 — NO_PROXY Protection Bypassed via RFC 1122 Loopback Subnet (127.0.0.0/8) in Axios 1.15.0. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7).
- moderate: Axios: Invisible JSON Response Tampering via Prototype Pollution Gadget in `parseReviver`. Rango afectado: >=1.0.0 <1.15.2. [Aviso](https://github.com/advisories/GHSA-3w6x-2g7m-8v23).
- low: Axios: Null Byte Injection via Reverse-Encoding in AxiosURLSearchParams. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-xhjh-pmcv-23jw).
- moderate: Axios: CRLF Injection in multipart/form-data body via unsanitized blob.type in formDataToStream. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-445q-vr5w-6q77).
- moderate: Axios: no_proxy bypass via IP alias allows SSRF. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-m7pr-hjqh-92cm).
- moderate: Axios' HTTP adapter-streamed uploads bypass maxBodyLength when maxRedirects: 0. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx).
- moderate: Axios: HTTP adapter streamed responses bypass maxContentLength. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-vf2m-468p-8v99).
- high: Axios: Prototype Pollution Gadgets - Response Tampering, Data Exfiltration, and Request Hijacking. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-pf86-5x62-jrwf).
- high: Axios: Header Injection via Prototype Pollution. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-6chq-wfr3-2hj9).
- moderate: Axios: XSRF Token Cross-Origin Leakage via Prototype Pollution Gadget in `withXSRFToken` Boolean Coercion. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-xx6v-rp6x-q39c).
- high: Axios is Vulnerable to Denial of Service via __proto__ Key in mergeConfig. Rango afectado: >=1.0.0 <=1.13.4. [Aviso](https://github.com/advisories/GHSA-43fc-jf86-j433).
- high: Axios has prototype pollution read-side gadgets in HTTP adapter that allow credential injection and request hijacking. Rango afectado: >=1.0.0 <1.15.2. [Aviso](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj).
- moderate: Axios has Unrestricted Cloud Metadata Exfiltration via Header Injection Chain. Rango afectado: >=1.0.0 <1.15.0. [Aviso](https://github.com/advisories/GHSA-fvcv-3m26-pcqx).
- moderate: Axios: unbounded recursion in toFormData causes DoS via deeply nested request data. Rango afectado: >=1.0.0 <1.15.1. [Aviso](https://github.com/advisories/GHSA-62hf-57xw-28j9).
- high: Axios: Regular Expression Denial of Service (ReDoS) via Cookie Name Injection. Rango afectado: >=1.0.0 <1.16.0. [Aviso](https://github.com/advisories/GHSA-hfxv-24rg-xrqf).
- high: Allocation of Resources Without Limits or Throttling in Axios. Rango afectado: >=1.7.0 <1.16.0. [Aviso](https://github.com/advisories/GHSA-777c-7fjr-54vf).
- high: Axios: Proxy-Authorization Credential Leak to Origin Server Across HTTP-to-HTTPS Redirect in Axios Node.js HTTP Adapter. Rango afectado: >=1.0.0 <1.16.0. [Aviso](https://github.com/advisories/GHSA-p92q-9vqr-4j8v).
- high: Axios: Proxy-Authorization header leaks to redirect target when proxy is re-evaluated to direct connection. Rango afectado: >=1.0.0 <1.16.0. [Aviso](https://github.com/advisories/GHSA-j5f8-grm9-p9fc).
- high: axios Vulnerable to Credential Theft and Response Hijacking via Prototype Pollution Gadget in Config Merge. Rango afectado: >=1.0.0 <1.15.2. [Aviso](https://github.com/advisories/GHSA-3g43-6gmg-66jw).
- high: axios Vulnerable to Full Man-in-the-Middle via Prototype Pollution Gadget in `config.proxy`. Rango afectado: >=1.0.0 <1.16.0. [Aviso](https://github.com/advisories/GHSA-35jp-ww65-95wh).
- moderate: axios has DoS & Header Injection via Prototype Pollution Read-Side Gadgets in axios merge functions. Rango afectado: >=1.0.0 <1.16.0. [Aviso](https://github.com/advisories/GHSA-898c-q2cr-xwhg).
- moderate: Axios: Prototype pollution gadgets can alter axios request construction. Rango afectado: >=1.0.0 <1.18.0. [Aviso](https://github.com/advisories/GHSA-mmx7-hfxf-jppx).
- moderate: Axios: Deep formToJSON Key Recursion Can Cause Denial of Service. Rango afectado: >=1.0.0 <1.18.0. [Aviso](https://github.com/advisories/GHSA-pmv8-rq9r-6j72).
- moderate: Axios: Nested axios option objects can consume polluted prototype values. Rango afectado: >=1.0.0 <1.18.0. [Aviso](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq).
- moderate: Axios: Fetch adapter `ReadableStream` uploads bypass `maxBodyLength`. Rango afectado: >=1.7.0 <1.18.0. [Aviso](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9).
- moderate: Axios: Excessive recursion in formDataToJSON can cause denial of service. Rango afectado: >=1.0.0 <1.18.0. [Aviso](https://github.com/advisories/GHSA-42h9-826w-cgv3).
- moderate: Axios: Prototype pollution gadget in fetch adapter can alter outbound requests. Rango afectado: >=1.7.0 <1.20.0. [Aviso](https://github.com/advisories/GHSA-vh66-26gq-q6x8).
- moderate: Axios: Prototype-Pollution Gadget in the Default Instance Allows Inherited Object.prototype.method to Override HTTP Method. Rango afectado: >=1.0.0 <1.20.0. [Aviso](https://github.com/advisories/GHSA-9fr6-4gfg-395g).
- moderate: Axios: Header Injection via Inherited headers After Minimal Interceptor. Rango afectado: >=1.0.0 <1.20.0. [Aviso](https://github.com/advisories/GHSA-j8rh-479h-cp32).

### body-parser

- low: body-parser vulnerable to denial of service when invalid limit value silently disables size enforcement. Rango afectado: <1.20.6. [Aviso](https://github.com/advisories/GHSA-v422-hmwv-36x6).
- high: body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body. Rango afectado: <1.20.9. [Aviso](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- Riesgo heredado de qs.

### brace-expansion

- low: brace-expansion Regular Expression Denial of Service vulnerability. Rango afectado: >=2.0.0 <=2.0.1. [Aviso](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw).
- moderate: brace-expansion: Zero-step sequence causes process hang and memory exhaustion. Rango afectado: <1.1.13. [Aviso](https://github.com/advisories/GHSA-f886-m6hf-6m8v).
- moderate: brace-expansion: Zero-step sequence causes process hang and memory exhaustion. Rango afectado: >=2.0.0 <2.0.3. [Aviso](https://github.com/advisories/GHSA-f886-m6hf-6m8v).
- high: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups. Rango afectado: >=2.0.0 <2.1.2. [Aviso](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp).
- high: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups. Rango afectado: <1.1.16. [Aviso](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp).
- high: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash. Rango afectado: <1.1.17. [Aviso](https://github.com/advisories/GHSA-mh99-v99m-4gvg).
- high: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash. Rango afectado: >=2.0.0 <2.1.3. [Aviso](https://github.com/advisories/GHSA-mh99-v99m-4gvg).
- high: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation. Rango afectado: >=2.0.0 <2.1.4. [Aviso](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- high: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation. Rango afectado: <1.1.18. [Aviso](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- moderate: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service. Rango afectado: <1.1.21. [Aviso](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- moderate: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service. Rango afectado: >=2.0.0 <2.1.7. [Aviso](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- high: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion. Rango afectado: <1.1.20. [Aviso](https://github.com/advisories/GHSA-qhr7-859c-m2p7).
- high: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion. Rango afectado: >=2.0.0 <2.1.6. [Aviso](https://github.com/advisories/GHSA-qhr7-859c-m2p7).
- high: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion. Rango afectado: <1.1.19. [Aviso](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).
- high: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion. Rango afectado: >=2.0.0 <2.1.5. [Aviso](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).

### browserslist

- high: Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM. Rango afectado: <=4.28.6. [Aviso](https://github.com/advisories/GHSA-c83g-rgw3-j3cx).
- high: Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats). Rango afectado: <=4.28.6. [Aviso](https://github.com/advisories/GHSA-73wf-gq98-2v4g).

### cookie

- low: cookie accepts cookie name, path, and domain with out of bounds characters. Rango afectado: <0.7.0. [Aviso](https://github.com/advisories/GHSA-pxg6-pf52-xh8x).

### csurf

- Riesgo heredado de cookie.

### deepmerge

- low: deepmerge mergeObject() allows prototype poisoning of returned objects. Rango afectado: >=4.2.0 <=4.3.1. [Aviso](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

### dompurify

- moderate: DOMPurify contains a Cross-site Scripting vulnerability. Rango afectado: >=3.1.3 <3.2.7. [Aviso](https://github.com/advisories/GHSA-v8jm-5vwx-cfxm).
- moderate: DOMPurify contains a Cross-site Scripting vulnerability. Rango afectado: >=3.1.3 <=3.3.1. [Aviso](https://github.com/advisories/GHSA-v2wj-7wpq-c8vv).
- moderate: DOMPurify: FORBID_TAGS bypassed by function-based ADD_TAGS predicate (asymmetry with FORBID_ATTR fix). Rango afectado: <3.4.0. [Aviso](https://github.com/advisories/GHSA-h7mw-gpvr-xq4m).
- moderate: DOMPurify has a SAFE_FOR_TEMPLATES bypass in RETURN_DOM mode. Rango afectado: >=1.0.10 <3.4.0. [Aviso](https://github.com/advisories/GHSA-crv5-9vww-q3g8).
- moderate: DOMPurify: Prototype Pollution to XSS Bypass via CUSTOM_ELEMENT_HANDLING Fallback. Rango afectado: >=3.0.1 <3.4.0. [Aviso](https://github.com/advisories/GHSA-v9jr-rg53-9pgp).
- moderate: DOMPurify: Cross-realm IN_PLACE sanitization leaves executable markup intact via realm-bound `instanceof` checks. Rango afectado: <=3.4.5. [Aviso](https://github.com/advisories/GHSA-hpcv-96wg-7vj8).
- moderate: DOMPurify: IN_PLACE mode preserves attributes of a clobbered root element, allowing XSS via attacker-controlled root DOM. Rango afectado: <=3.4.5. [Aviso](https://github.com/advisories/GHSA-r47g-fvhr-h676).
- moderate: DOMPurify IN_PLACE Sanitization Bypass via Attached Shadow Root Inside <template>.content. Rango afectado: <=3.4.6. [Aviso](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq).
- moderate: DOMPurify: Permanent `ALLOWED_ATTR` pollution via `setConfig()` bypassing the hook clone-guard (incomplete fix of the 3.4.7 hook-pollution patch). Rango afectado: <=3.4.10. [Aviso](https://github.com/advisories/GHSA-cmwh-pvxp-8882).
- low: DOMPurify: Trusted Types policy survives `clearConfig()` and can poison later `RETURN_TRUSTED_TYPE` output. Rango afectado: <3.4.9. [Aviso](https://github.com/advisories/GHSA-vxr8-fq34-vvx9).
- low: DOMPurify: SAFE_FOR_TEMPLATES bypass - template expressions survive sanitization inside <template> content when using DOM output modes. Rango afectado: >=3.0.0 <=3.4.7. [Aviso](https://github.com/advisories/GHSA-gvmj-g25r-r7wr).
- low: DOMPurify: `IN_PLACE` mode trusts attacker-controlled `nodeName` on live non-form nodes, allowing script retention and XSS via attacker-supplied DOM objects. Rango afectado: <=3.4.6. [Aviso](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4).
- moderate: DOMPurify: Hook mutation of `data.allowedTags` / `data.allowedAttributes` permanently pollutes `DEFAULT_ALLOWED_TAGS` / `DEFAULT_ALLOWED_ATTR`. Rango afectado: <3.4.7. [Aviso](https://github.com/advisories/GHSA-76mc-f452-cxcm).
- moderate: DOMPurify's ADD_TAGS function form bypasses FORBID_TAGS due to short-circuit evaluation. Rango afectado: <=3.3.3. [Aviso](https://github.com/advisories/GHSA-39q2-94rc-95cp).
- moderate: DOMPurify ADD_ATTR predicate skips URI validation. Rango afectado: <=3.3.1. [Aviso](https://github.com/advisories/GHSA-cjmm-f4jc-qw8r).
- moderate: DOMPurify USE_PROFILES prototype pollution allows event handlers. Rango afectado: <=3.3.1. [Aviso](https://github.com/advisories/GHSA-cj63-jhhr-wcxv).
- moderate: DOMPurify is vulnerable to mutation-XSS via Re-Contextualization . Rango afectado: <3.3.2. [Aviso](https://github.com/advisories/GHSA-h8r8-wccr-v5f2).
- moderate: DOMPurify: IN_PLACE hook removal leaves a detached subtree executable, causing XSS. Rango afectado: <=3.4.12. [Aviso](https://github.com/advisories/GHSA-55q2-fjhq-7xh7).
- low: DOMPurify: `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` for allowed custom elements.. Rango afectado: <=3.4.11. [Aviso](https://github.com/advisories/GHSA-c2j3-45gr-mqc4).
- low: DOMPurify: IN_PLACE returns a force-removed rawtext root whose text carries attacker markup — pure HTML reparse executes. Rango afectado: <=3.4.15. [Aviso](https://github.com/advisories/GHSA-6688-9rhm-gjv2).
- high: DOMPurify IN_PLACE: hook that removes a parent or sibling leaves the detached subtree's event handlers armed (incomplete fix for GHSA-p98j-92pf-mc4p). Rango afectado: <=3.4.16. [Aviso](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr).
- low: DOMPurify: SMIL attributeName=href guard is skipped when PARSER_MEDIA_TYPE is application/xhtml+xml. Rango afectado: <=3.4.16. [Aviso](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f).

### drizzle-kit

- Riesgo heredado de @esbuild-kit/esm-loader.
- Riesgo heredado de esbuild.

### drizzle-orm

- high: Drizzle ORM has SQL injection via improperly escaped SQL identifiers. Rango afectado: <0.45.2. [Aviso](https://github.com/advisories/GHSA-gpj5-g38j-94v9).

### esbuild

- moderate: esbuild enables any website to send any requests to the development server and read the response. Rango afectado: <=0.24.2. [Aviso](https://github.com/advisories/GHSA-67mh-4wv8-2f99).

### exceljs

- Riesgo heredado de uuid.

### express

- Riesgo heredado de body-parser.
- Riesgo heredado de path-to-regexp.
- Riesgo heredado de qs.

### express-brute

- moderate: Rate Limiting Bypass in express-brute. Rango afectado: <=1.0.1. [Aviso](https://github.com/advisories/GHSA-984p-xq9m-4rjw).
- Riesgo heredado de underscore.

### express-session

- Riesgo heredado de on-headers.

### express-validator

- Riesgo heredado de validator.

### fflate

- moderate: fflate unzipSync can enter an infinite loop when parsing malformed ZIP64 archives. Rango afectado: >=0.8.0 <0.8.3. [Aviso](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

### follow-redirects

- moderate: follow-redirects leaks Custom Authentication Headers to Cross-Domain Redirect Targets. Rango afectado: <=1.15.11. [Aviso](https://github.com/advisories/GHSA-r4q5-vmmm-2653).

### form-data

- critical: form-data uses unsafe random function in form-data for choosing boundary. Rango afectado: >=4.0.0 <4.0.4. [Aviso](https://github.com/advisories/GHSA-fjxv-7rqg-78g4).
- high: form-data: CRLF injection in form-data via unescaped multipart field names and filenames. Rango afectado: >=4.0.0 <4.0.6. [Aviso](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx).

### glob

- high: glob CLI: Command injection via -c/--cmd executes matches with shell:true. Rango afectado: >=10.2.0 <10.5.0. [Aviso](https://github.com/advisories/GHSA-5j98-mcp5-4vw2).

### jspdf

- high: jsPDF Denial of Service (DoS). Rango afectado: <=3.0.1. [Aviso](https://github.com/advisories/GHSA-8mvj-3j78-4qmw).
- critical: jsPDF has Local File Inclusion/Path Traversal vulnerability. Rango afectado: <=3.0.4. [Aviso](https://github.com/advisories/GHSA-f8cm-6447-x5h2).
- high: jsPDF has PDF Injection in AcroFormChoiceField that allows Arbitrary JavaScript Execution. Rango afectado: <=4.0.0. [Aviso](https://github.com/advisories/GHSA-pqxr-3g65-p328).
- high: jsPDF Vulnerable to Denial of Service (DoS) via Unvalidated BMP Dimensions in BMPDecoder. Rango afectado: <=4.0.0. [Aviso](https://github.com/advisories/GHSA-95fx-jjr5-f39c).
- moderate: jsPDF Vulnerable to Stored XMP Metadata Injection (Spoofing & Integrity Violation). Rango afectado: <=4.0.0. [Aviso](https://github.com/advisories/GHSA-vm32-vv63-w422).
- moderate: jsPDF has Shared State Race Condition in addJS Plugin. Rango afectado: <=4.0.0. [Aviso](https://github.com/advisories/GHSA-cjw8-79x6-5cj4).
- high: jsPDF has a PDF Object Injection via Unsanitized Input in addJS Method. Rango afectado: <4.2.0. [Aviso](https://github.com/advisories/GHSA-9vjf-qc39-jprp).
- high: jsPDF Affected by Client-Side/Server-Side Denial of Service via Malicious GIF Dimensions. Rango afectado: <4.2.0. [Aviso](https://github.com/advisories/GHSA-67pg-wm7f-q7fj).
- high: jsPDF has a PDF Injection in AcroForm module allows Arbitrary JavaScript Execution (RadioButton.createOption and "AS" property). Rango afectado: <4.2.0. [Aviso](https://github.com/advisories/GHSA-p5xg-68wr-hm3m).
- high: jsPDF has a PDF Object Injection via FreeText color. Rango afectado: <=4.2.0. [Aviso](https://github.com/advisories/GHSA-7x6v-j9x4-qf24).
- critical: jsPDF has HTML Injection in New Window paths. Rango afectado: <=4.2.0. [Aviso](https://github.com/advisories/GHSA-wfv2-pwc8-crg5).

### jws

- high: auth0/node-jws Improperly Verifies HMAC Signature. Rango afectado: <3.2.3. [Aviso](https://github.com/advisories/GHSA-869p-cjfg-cm3x).

### lodash

- high: lodash vulnerable to Code Injection via `_.template` imports key names. Rango afectado: >=4.0.0 <=4.17.23. [Aviso](https://github.com/advisories/GHSA-r5fr-rjxr-66jc).
- moderate: lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit`. Rango afectado: <=4.17.23. [Aviso](https://github.com/advisories/GHSA-f23m-r3pf-42rh).
- moderate: Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions. Rango afectado: >=4.0.0 <=4.17.22. [Aviso](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg).

### minimatch

- high: minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern. Rango afectado: <3.1.3. [Aviso](https://github.com/advisories/GHSA-3ppc-4f35-3m26).
- high: minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern. Rango afectado: >=5.0.0 <5.1.7. [Aviso](https://github.com/advisories/GHSA-3ppc-4f35-3m26).
- high: minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern. Rango afectado: >=9.0.0 <9.0.6. [Aviso](https://github.com/advisories/GHSA-3ppc-4f35-3m26).
- high: minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments. Rango afectado: <3.1.3. [Aviso](https://github.com/advisories/GHSA-7r86-cg39-jmmj).
- high: minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments. Rango afectado: >=5.0.0 <5.1.8. [Aviso](https://github.com/advisories/GHSA-7r86-cg39-jmmj).
- high: minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments. Rango afectado: >=9.0.0 <9.0.7. [Aviso](https://github.com/advisories/GHSA-7r86-cg39-jmmj).
- high: minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions. Rango afectado: <3.1.4. [Aviso](https://github.com/advisories/GHSA-23c5-xmqv-rm74).
- high: minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions. Rango afectado: >=5.0.0 <5.1.8. [Aviso](https://github.com/advisories/GHSA-23c5-xmqv-rm74).
- high: minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions. Rango afectado: >=9.0.0 <9.0.7. [Aviso](https://github.com/advisories/GHSA-23c5-xmqv-rm74).

### multer

- high: Multer vulnerable to Denial of Service via unhandled exception from malformed request. Rango afectado: >=1.4.4-lts.1 <2.0.2. [Aviso](https://github.com/advisories/GHSA-fjgf-rc76-4x9p).
- high: Multer vulnerable to Denial of Service via incomplete cleanup. Rango afectado: <2.1.0. [Aviso](https://github.com/advisories/GHSA-xf7r-hgr6-v32p).
- high: Multer vulnerable to Denial of Service via resource exhaustion. Rango afectado: <2.1.0. [Aviso](https://github.com/advisories/GHSA-v52c-386h-88mc).
- high: Multer Vulnerable to Denial of Service via Uncontrolled Recursion. Rango afectado: <2.1.1. [Aviso](https://github.com/advisories/GHSA-5528-5vmv-3xc2).
- high: Multer vulnerable to Denial of Service via deeply nested field names. Rango afectado: >=1.0.0 <2.2.0. [Aviso](https://github.com/advisories/GHSA-72gw-mp4g-v24j).
- moderate: Multer vulnerable to Denial of Service via incomplete cleanup of aborted uploads. Rango afectado: >=2.0.0-alpha.1 <2.2.0. [Aviso](https://github.com/advisories/GHSA-3p4h-7m6x-2hcm).
- high: multer vulnerable to Denial of Service via crafted multipart field names. Rango afectado: <2.3.0. [Aviso](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm).
- low: multer vulnerable to file size limit bypass via async fileFilter race condition. Rango afectado: <2.3.0. [Aviso](https://github.com/advisories/GHSA-qvfw-j98x-7q72).
- high: multer vulnerable to Denial of Service via oversized array index in field names. Rango afectado: <2.3.0. [Aviso](https://github.com/advisories/GHSA-535w-7cp7-47q4).
- high: multer vulnerable to Denial of Service via a pending asynchronous fileFilter after request teardown. Rango afectado: >=2.0.0 <2.5.0. [Aviso](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

### nanoid

- high: nanoid: custom generators can loop indefinitely when size is zero. Rango afectado: <3.3.18. [Aviso](https://github.com/advisories/GHSA-2v37-7h3g-55p8).

### node-forge

- high: node-forge has ASN.1 Unbounded Recursion. Rango afectado: <1.3.2. [Aviso](https://github.com/advisories/GHSA-554w-wpv2-vw27).
- high: node-forge has an Interpretation Conflict vulnerability via its ASN.1 Validator Desynchronization. Rango afectado: <1.3.2. [Aviso](https://github.com/advisories/GHSA-5gfm-wpxj-wjgq).
- moderate: node-forge is vulnerable to ASN.1 OID Integer Truncation. Rango afectado: <1.3.2. [Aviso](https://github.com/advisories/GHSA-65ch-62r8-g69g).
- high: Forge has a basicConstraints bypass in its certificate chain verification (RFC 5280 violation). Rango afectado: <=1.3.3. [Aviso](https://github.com/advisories/GHSA-2328-f5f3-gj25).
- high: Forge has signature forgery in Ed25519 due to missing S > L check. Rango afectado: <1.4.0. [Aviso](https://github.com/advisories/GHSA-q67f-28xg-22rw).
- high: Forge has Denial of Service via Infinite Loop in BigInteger.modInverse() with Zero Input. Rango afectado: <1.4.0. [Aviso](https://github.com/advisories/GHSA-5m6q-g25r-mvwx).
- high: Forge has signature forgery in RSA-PKCS due to ASN.1 extra field  . Rango afectado: <1.4.0. [Aviso](https://github.com/advisories/GHSA-ppp5-5v6c-4jwp).
- high: node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements. Rango afectado: <=1.4.0. [Aviso](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

### on-headers

- low: on-headers is vulnerable to http response header manipulation. Rango afectado: <1.1.0. [Aviso](https://github.com/advisories/GHSA-76c9-3jph-rj3q).

### path-to-regexp

- high: path-to-regexp vulnerable to Regular Expression Denial of Service via multiple route parameters. Rango afectado: <0.1.13. [Aviso](https://github.com/advisories/GHSA-37ch-88jc-xwx2).

### picomatch

- moderate: Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching. Rango afectado: <2.3.2. [Aviso](https://github.com/advisories/GHSA-3v7f-55p6-f55p).
- high: Picomatch has a ReDoS vulnerability via extglob quantifiers. Rango afectado: <2.3.2. [Aviso](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj).

### postcss-selector-parser

- low: postcss-selector-parser allows denial of service through uncontrolled AST recursion. Rango afectado: >=6.1.0 <6.1.3. [Aviso](https://github.com/advisories/GHSA-w9m9-85wc-3x92).
- moderate: PostCSS: Quadratic complexity in flat selector parsing allows CPU exhaustion. Rango afectado: <6.1.5. [Aviso](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

### proxy-addr

- critical: proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet. Rango afectado: >=1.1.0 <2.0.8. [Aviso](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).

### qs

- low: qs's arrayLimit bypass in comma parsing allows denial of service. Rango afectado: >=6.7.0 <=6.14.1. [Aviso](https://github.com/advisories/GHSA-w7fw-mjwx-w883).
- moderate: qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion. Rango afectado: <6.14.1. [Aviso](https://github.com/advisories/GHSA-6rw7-vpxm-498p).
- moderate: qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefined entries in comma-format arrays when encodeValuesOnly is set. Rango afectado: >=6.11.1 <=6.15.1. [Aviso](https://github.com/advisories/GHSA-q8mj-m7cp-5q26).
- moderate: qs: Denial of Service via Attacker Controlled isBuffer. Rango afectado: >=2.2.5 <6.16.0. [Aviso](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
- moderate: qs : qs.stringify with arrayFormat 'comma' throws an uncaught TypeError on array elements carrying a non-callable own toString (DoS). Rango afectado: >=6.7.0 <=6.16.0. [Aviso](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

### rollup

- high: Rollup 4 has Arbitrary File Write via Path Traversal. Rango afectado: >=4.0.0 <4.59.0. [Aviso](https://github.com/advisories/GHSA-mw96-cpmx-2vgc).

### source-map-js

- high: source-map-js allows event-loop denial of service through indexed source-map section offsets. Rango afectado: >=1.0.0 <1.2.2. [Aviso](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

### tmp

- low: tmp allows arbitrary temporary file / directory write via symbolic link `dir` parameter. Rango afectado: <=0.2.3. [Aviso](https://github.com/advisories/GHSA-52f5-9888-hmc6).
- high: tmp has Path Traversal via unsanitized prefix/postfix that enables directory escape. Rango afectado: <0.2.6. [Aviso](https://github.com/advisories/GHSA-ph9p-34f9-6g65).

### tsx

- Riesgo heredado de esbuild.

### underscore

- critical: Arbitrary Code Execution in underscore. Rango afectado: >=1.3.2 <1.12.1. [Aviso](https://github.com/advisories/GHSA-cf4h-3jhx-xvhq).
- high: Underscore has unlimited recursion in _.flatten and _.isEqual, potential for DoS attack. Rango afectado: <=1.13.7. [Aviso](https://github.com/advisories/GHSA-qpx9-hpmf-5gmw).

### uuid

- moderate: uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided. Rango afectado: <11.1.1. [Aviso](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

### validator

- moderate: validator.js has a URL validation bypass vulnerability in its isURL function. Rango afectado: <13.15.20. [Aviso](https://github.com/advisories/GHSA-9965-vmph-33xx).
- high: Validator is Vulnerable to Incomplete Filtering of One or More Instances of Special Elements. Rango afectado: <13.15.22. [Aviso](https://github.com/advisories/GHSA-vghf-hv5q-vc2g).

### vite

- low: Vite middleware may serve files starting with the same name with the public directory. Rango afectado: <=5.4.19. [Aviso](https://github.com/advisories/GHSA-g4jq-h2w9-997c).
- low: Vite's `server.fs` settings were not applied to HTML files. Rango afectado: <=5.4.19. [Aviso](https://github.com/advisories/GHSA-jqfw-vq24-v9c3).
- moderate: vite allows server.fs.deny bypass via backslash on Windows. Rango afectado: >=5.2.6 <=5.4.20. [Aviso](https://github.com/advisories/GHSA-93m4-6634-74q7).
- moderate: Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling. Rango afectado: <=6.4.1. [Aviso](https://github.com/advisories/GHSA-4w7w-66w2-5vf9).
- moderate: launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows. Rango afectado: <=6.4.2. [Aviso](https://github.com/advisories/GHSA-v6wh-96g9-6wx3).
- moderate: launch-editor: escapeCmdArgs() omits % escaping on Windows. Rango afectado: <=6.4.3. [Aviso](https://github.com/advisories/GHSA-698v-4r3x-3vcv).
- moderate: launch-editor: escapeCmdArgs() omits % escaping on Windows. Rango afectado: >=8.2.0 <=8.2.3. [Aviso](https://github.com/advisories/GHSA-698v-4r3x-3vcv).
- moderate: launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors. Rango afectado: <=6.4.3. [Aviso](https://github.com/advisories/GHSA-r825-w8mm-5pxw).
- moderate: launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors. Rango afectado: >=8.2.0 <=8.2.3. [Aviso](https://github.com/advisories/GHSA-r825-w8mm-5pxw).
- high: launch-editor: `fs.existsSync()` existence check can be bypassed on Windows. Rango afectado: <=6.4.3. [Aviso](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
- high: launch-editor: `fs.existsSync()` existence check can be bypassed on Windows. Rango afectado: >=8.2.0 <=8.2.3. [Aviso](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
- low: Vite: Cross origin script execution through Vite custom middleware. Rango afectado: <=6.4.3. [Aviso](https://github.com/advisories/GHSA-9jrq-w75r-8gcw).
- low: Vite: Cross origin script execution through Vite custom middleware. Rango afectado: >=8.2.0 <=8.2.3. [Aviso](https://github.com/advisories/GHSA-9jrq-w75r-8gcw).
- moderate: Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine. Rango afectado: <=6.4.3. [Aviso](https://github.com/advisories/GHSA-rq7h-c2jc-7f22).
- moderate: Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine. Rango afectado: >=8.2.0 <=8.2.3. [Aviso](https://github.com/advisories/GHSA-rq7h-c2jc-7f22).
- moderate: Vite: First 4 bytes of files outside of `server.fs` setting is exposed by `?vite-wasm-instance`. Rango afectado: >=8.2.0 <=8.2.3. [Aviso](https://github.com/advisories/GHSA-vfpm-58rq-9qcg).
- moderate: vite: `server.fs.deny` bypass on Windows alternate paths. Rango afectado: <=6.4.2. [Aviso](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).
- Riesgo heredado de esbuild.

### vitest

- Riesgo heredado de @vitest/coverage-v8.
- Riesgo heredado de @vitest/mocker.
- moderate: Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock. Rango afectado: >=2.1.0 <4.1.11. [Aviso](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

### ws

- moderate: ws: Uninitialized memory disclosure. Rango afectado: >=8.0.0 <8.20.1. [Aviso](https://github.com/advisories/GHSA-58qx-3vcg-4xpx).
- high: ws: Memory exhaustion DoS from tiny fragments and data chunks. Rango afectado: >=8.0.0 <8.21.0. [Aviso](https://github.com/advisories/GHSA-96hv-2xvq-fx4p).

### xlsx

- high: Prototype Pollution in sheetJS. Rango afectado: <0.19.3. [Aviso](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6).
- high: SheetJS Regular Expression Denial of Service (ReDoS). Rango afectado: <0.20.2. [Aviso](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9).

### yaml

- moderate: yaml is vulnerable to Stack Overflow via deeply nested YAML collections. Rango afectado: >=2.0.0 <2.8.3. [Aviso](https://github.com/advisories/GHSA-48c2-rrv3-qjmp).

### zod

- high: Zod can exhaust memory while validating oversized constrained collections. Rango afectado: <4.6.6. [Aviso](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

### zod-validation-error

- Riesgo heredado de zod.
