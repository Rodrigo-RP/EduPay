# Escaneo de seguridad de Replit

Se ejecutaron runDependencyAudit, runSastScan y runHoundDogScan en este hilo. Los tres finalizaron correctamente; el análisis estático informó incomplete=false. No se creó una tarea, no se ejecutó Fix all y no se modificaron hallazgos ajenos al alcance.

## Dependencias

176 registros de avisos/versiones: 4 críticos, 75 altos, 81 moderados y 16 bajos. Este escáner cuenta registros individuales; npm audit agrupa 54 paquetes afectados. No son métricas intercambiables. Las versiones sugeridas por el escáner NO se instalaron automáticamente ni se validó su antigüedad.

| Severidad | Paquete | Versión | Aviso | Corrección sugerida |
|---|---|---|---|---|
| critical | form-data | 4.0.3 | GHSA-fjxv-7rqg-78g4@form-data-4.0.3 | 4.0.4 |
| critical | jspdf | 3.0.1 | GHSA-f8cm-6447-x5h2@jspdf-3.0.1 | 4.0.0 (incompatible) |
| critical | jspdf | 3.0.1 | GHSA-wfv2-pwc8-crg5@jspdf-3.0.1 | 4.2.1 (incompatible) |
| critical | proxy-addr | 2.0.7 | GHSA-jqcg-44mw-7w3h@proxy-addr-2.0.7 | 2.0.8 |
| high | axios | 1.10.0 | GHSA-35jp-ww65-95wh@axios-1.10.0 | 1.16.0 |
| high | axios | 1.10.0 | GHSA-3g43-6gmg-66jw@axios-1.10.0 | 1.15.2 |
| high | axios | 1.10.0 | GHSA-43fc-jf86-j433@axios-1.10.0 | 1.13.5 |
| high | axios | 1.10.0 | GHSA-4hjh-wcwx-xvwj@axios-1.10.0 | 1.12.0 |
| high | axios | 1.10.0 | GHSA-62hf-57xw-28j9@axios-1.10.0 | 1.15.1 |
| high | axios | 1.10.0 | GHSA-6chq-wfr3-2hj9@axios-1.10.0 | 1.15.1 |
| high | axios | 1.10.0 | GHSA-777c-7fjr-54vf@axios-1.10.0 | 1.16.0 |
| high | axios | 1.10.0 | GHSA-hfxv-24rg-xrqf@axios-1.10.0 | 1.16.0 |
| high | axios | 1.10.0 | GHSA-j5f8-grm9-p9fc@axios-1.10.0 | 1.16.0 |
| high | axios | 1.10.0 | GHSA-p92q-9vqr-4j8v@axios-1.10.0 | 1.16.0 |
| high | axios | 1.10.0 | GHSA-pf86-5x62-jrwf@axios-1.10.0 | 1.15.1 |
| high | axios | 1.10.0 | GHSA-pmwg-cvhr-8vh7@axios-1.10.0 | 1.15.1 |
| high | axios | 1.10.0 | GHSA-q8qp-cvcw-x6jj@axios-1.10.0 | 1.15.2 |
| high | body-parser | 1.20.3 | GHSA-27r3-jxmh-p828@body-parser-1.20.3 | 1.20.9 |
| high | brace-expansion | 1.1.12 | GHSA-6j4f-fj2g-mc7p@brace-expansion-1.1.12 | 1.1.19 |
| high | brace-expansion | 1.1.12 | GHSA-mh99-v99m-4gvg@brace-expansion-1.1.12 | 1.1.17 |
| high | brace-expansion | 1.1.12 | GHSA-qhr7-859c-m2p7@brace-expansion-1.1.12 | 1.1.20 |
| high | brace-expansion | 1.1.12 | GHSA-rgw5-rvv9-x895@brace-expansion-1.1.12 | 1.1.18 |
| high | brace-expansion | 2.0.1 | GHSA-6j4f-fj2g-mc7p@brace-expansion-2.0.1 | 2.1.5 |
| high | brace-expansion | 2.0.1 | GHSA-mh99-v99m-4gvg@brace-expansion-2.0.1 | 2.1.3 |
| high | brace-expansion | 2.0.1 | GHSA-qhr7-859c-m2p7@brace-expansion-2.0.1 | 2.1.6 |
| high | brace-expansion | 2.0.1 | GHSA-rgw5-rvv9-x895@brace-expansion-2.0.1 | 2.1.4 |
| high | browserslist | 4.24.2 | GHSA-73wf-gq98-2v4g@browserslist-4.24.2 | 4.28.7 |
| high | browserslist | 4.24.2 | GHSA-c83g-rgw3-j3cx@browserslist-4.24.2 | 4.28.7 |
| high | dompurify | 3.2.6 | GHSA-mrv2-3pqr-j5jr@dompurify-3.2.6 | 3.4.17 |
| high | drizzle-orm | 0.39.1 | GHSA-gpj5-g38j-94v9@drizzle-orm-0.39.1 | 0.45.2 |
| high | fflate | 0.8.2 | GHSA-px8p-9vwx-vf98@fflate-0.8.2 | 0.8.3 |
| high | form-data | 4.0.3 | GHSA-hmw2-7cc7-3qxx@form-data-4.0.3 | 4.0.6 |
| high | glob | 10.4.5 | GHSA-5j98-mcp5-4vw2@glob-10.4.5 | 10.5.0 |
| high | jspdf | 3.0.1 | GHSA-67pg-wm7f-q7fj@jspdf-3.0.1 | 4.2.0 (incompatible) |
| high | jspdf | 3.0.1 | GHSA-7x6v-j9x4-qf24@jspdf-3.0.1 | 4.2.1 (incompatible) |
| high | jspdf | 3.0.1 | GHSA-8mvj-3j78-4qmw@jspdf-3.0.1 | 3.0.2 |
| high | jspdf | 3.0.1 | GHSA-95fx-jjr5-f39c@jspdf-3.0.1 | 4.1.0 (incompatible) |
| high | jspdf | 3.0.1 | GHSA-9vjf-qc39-jprp@jspdf-3.0.1 | 4.2.0 (incompatible) |
| high | jspdf | 3.0.1 | GHSA-p5xg-68wr-hm3m@jspdf-3.0.1 | 4.2.0 (incompatible) |
| high | jspdf | 3.0.1 | GHSA-pqxr-3g65-p328@jspdf-3.0.1 | 4.1.0 (incompatible) |
| high | jws | 3.2.2 | GHSA-869p-cjfg-cm3x@jws-3.2.2 | 3.2.3 |
| high | lodash | 4.17.21 | GHSA-r5fr-rjxr-66jc@lodash-4.17.21 | 4.18.0 |
| high | minimatch | 3.1.2 | GHSA-23c5-xmqv-rm74@minimatch-3.1.2 | 3.1.4 |
| high | minimatch | 3.1.2 | GHSA-3ppc-4f35-3m26@minimatch-3.1.2 | 3.1.3 |
| high | minimatch | 3.1.2 | GHSA-7r86-cg39-jmmj@minimatch-3.1.2 | 3.1.3 |
| high | minimatch | 5.1.6 | GHSA-23c5-xmqv-rm74@minimatch-5.1.6 | 5.1.8 |
| high | minimatch | 5.1.6 | GHSA-3ppc-4f35-3m26@minimatch-5.1.6 | 5.1.7 |
| high | minimatch | 5.1.6 | GHSA-7r86-cg39-jmmj@minimatch-5.1.6 | 5.1.8 |
| high | minimatch | 9.0.5 | GHSA-23c5-xmqv-rm74@minimatch-9.0.5 | 9.0.7 |
| high | minimatch | 9.0.5 | GHSA-3ppc-4f35-3m26@minimatch-9.0.5 | 9.0.6 |
| high | minimatch | 9.0.5 | GHSA-7r86-cg39-jmmj@minimatch-9.0.5 | 9.0.7 |
| high | multer | 2.0.1 | GHSA-535w-7cp7-47q4@multer-2.0.1 | 2.3.0 |
| high | multer | 2.0.1 | GHSA-5528-5vmv-3xc2@multer-2.0.1 | 2.1.1 |
| high | multer | 2.0.1 | GHSA-72gw-mp4g-v24j@multer-2.0.1 | 2.2.0 |
| high | multer | 2.0.1 | GHSA-fjgf-rc76-4x9p@multer-2.0.1 | 2.0.2 |
| high | multer | 2.0.1 | GHSA-q7qp-rjg7-q26m@multer-2.0.1 | 2.5.0 |
| high | multer | 2.0.1 | GHSA-v52c-386h-88mc@multer-2.0.1 | 2.1.0 |
| high | multer | 2.0.1 | GHSA-wc9g-mqfw-jrwm@multer-2.0.1 | 2.3.0 |
| high | multer | 2.0.1 | GHSA-xf7r-hgr6-v32p@multer-2.0.1 | 2.1.0 |
| high | node-forge | 1.3.1 | GHSA-2328-f5f3-gj25@node-forge-1.3.1 | 1.4.0 |
| high | node-forge | 1.3.1 | GHSA-554w-wpv2-vw27@node-forge-1.3.1 | 1.3.2 |
| high | node-forge | 1.3.1 | GHSA-5gfm-wpxj-wjgq@node-forge-1.3.1 | 1.3.2 |
| high | node-forge | 1.3.1 | GHSA-5m6q-g25r-mvwx@node-forge-1.3.1 | 1.4.0 |
| high | node-forge | 1.3.1 | GHSA-86w9-cpqp-85rv@node-forge-1.3.1 | Sin corrección indicada |
| high | node-forge | 1.3.1 | GHSA-ppp5-5v6c-4jwp@node-forge-1.3.1 | 1.4.0 |
| high | node-forge | 1.3.1 | GHSA-q67f-28xg-22rw@node-forge-1.3.1 | 1.4.0 |
| high | path-to-regexp | 0.1.12 | GHSA-37ch-88jc-xwx2@path-to-regexp-0.1.12 | 0.1.13 |
| high | picomatch | 2.3.1 | GHSA-c2c7-rcm5-vvqj@picomatch-2.3.1 | 2.3.2 |
| high | rollup | 4.24.4 | GHSA-mw96-cpmx-2vgc@rollup-4.24.4 | 4.59.0 |
| high | source-map-js | 1.2.1 | GHSA-68fv-2mgg-jv7q@source-map-js-1.2.1 | 1.2.2 |
| high | tmp | 0.2.3 | GHSA-ph9p-34f9-6g65@tmp-0.2.3 | 0.2.6 |
| high | uuid | 8.3.2 | GHSA-w5hq-g745-h8pq@uuid-8.3.2 | 11.1.1 (incompatible) |
| high | validator | 13.12.0 | GHSA-vghf-hv5q-vc2g@validator-13.12.0 | 13.15.22 |
| high | vite | 5.4.19 | GHSA-587h-7wmj-h5pm@vite-5.4.19 | 6.4.4 (incompatible) |
| high | vite | 8.2.0 | GHSA-587h-7wmj-h5pm@vite-8.2.0 | 8.2.4 |
| high | ws | 8.18.3 | GHSA-96hv-2xvq-fx4p@ws-8.18.3 | 8.21.0 |
| high | xlsx | 0.20.3 | GHSA-4r6h-8v6p-xvw6@xlsx-0.20.3 | Sin corrección indicada |
| high | xlsx | 0.20.3 | GHSA-5pgg-2g8v-p4x9@xlsx-0.20.3 | Sin corrección indicada |
| high | zod | 3.25.76 | GHSA-mrhx-c7xc-m3w5@zod-3.25.76 | 4.6.6 (incompatible) |
| moderate | @babel/helpers | 7.26.0 | GHSA-968p-4wvh-cqc8@@babel/helpers-7.26.0 | 7.26.10 |
| moderate | @vitest/mocker | 4.1.10 | GHSA-82fw-gwwq-j7x9@@vitest/mocker-4.1.10 | 4.1.11 |
| moderate | @vitest/mocker | 4.1.10 | GHSA-qxg6-89mg-rqv8@@vitest/mocker-4.1.10 | 4.1.12 |
| moderate | axios | 1.10.0 | GHSA-3p68-rc4w-qgx5@axios-1.10.0 | 1.15.0 |
| moderate | axios | 1.10.0 | GHSA-3w6x-2g7m-8v23@axios-1.10.0 | 1.15.2 |
| moderate | axios | 1.10.0 | GHSA-42h9-826w-cgv3@axios-1.10.0 | 1.18.0 |
| moderate | axios | 1.10.0 | GHSA-445q-vr5w-6q77@axios-1.10.0 | 1.15.1 |
| moderate | axios | 1.10.0 | GHSA-5c9x-8gcm-mpgx@axios-1.10.0 | 1.15.1 |
| moderate | axios | 1.10.0 | GHSA-7q8q-rj6j-mhjq@axios-1.10.0 | 1.18.0 |
| moderate | axios | 1.10.0 | GHSA-898c-q2cr-xwhg@axios-1.10.0 | 1.16.0 |
| moderate | axios | 1.10.0 | GHSA-9fr6-4gfg-395g@axios-1.10.0 | 1.20.0 |
| moderate | axios | 1.10.0 | GHSA-fvcv-3m26-pcqx@axios-1.10.0 | 1.15.0 |
| moderate | axios | 1.10.0 | GHSA-j8rh-479h-cp32@axios-1.10.0 | 1.20.0 |
| moderate | axios | 1.10.0 | GHSA-jqh4-m9w3-8hp9@axios-1.10.0 | 1.18.0 |
| moderate | axios | 1.10.0 | GHSA-m7pr-hjqh-92cm@axios-1.10.0 | 1.15.1 |
| moderate | axios | 1.10.0 | GHSA-mmx7-hfxf-jppx@axios-1.10.0 | 1.18.0 |
| moderate | axios | 1.10.0 | GHSA-pmv8-rq9r-6j72@axios-1.10.0 | 1.18.0 |
| moderate | axios | 1.10.0 | GHSA-vf2m-468p-8v99@axios-1.10.0 | 1.15.1 |
| moderate | axios | 1.10.0 | GHSA-vh66-26gq-q6x8@axios-1.10.0 | 1.20.0 |
| moderate | axios | 1.10.0 | GHSA-w9j2-pvgh-6h63@axios-1.10.0 | 1.15.1 |
| moderate | axios | 1.10.0 | GHSA-xx6v-rp6x-q39c@axios-1.10.0 | 1.15.1 |
| moderate | brace-expansion | 1.1.12 | GHSA-3jxr-9vmj-r5cp@brace-expansion-1.1.12 | 1.1.16 |
| moderate | brace-expansion | 1.1.12 | GHSA-f886-m6hf-6m8v@brace-expansion-1.1.12 | 1.1.13 |
| moderate | brace-expansion | 1.1.12 | GHSA-q2hr-2g5m-vwhr@brace-expansion-1.1.12 | 1.1.21 |
| moderate | brace-expansion | 2.0.1 | GHSA-3jxr-9vmj-r5cp@brace-expansion-2.0.1 | 2.1.2 |
| moderate | brace-expansion | 2.0.1 | GHSA-f886-m6hf-6m8v@brace-expansion-2.0.1 | 2.0.3 |
| moderate | brace-expansion | 2.0.1 | GHSA-q2hr-2g5m-vwhr@brace-expansion-2.0.1 | 2.1.7 |
| moderate | cookie | 0.4.0 | GHSA-pxg6-pf52-xh8x@cookie-0.4.0 | 0.7.0 |
| moderate | deepmerge | 4.3.1 | GHSA-gcqx-w48m-w2h4@deepmerge-4.3.1 | Sin corrección indicada |
| moderate | dompurify | 3.2.6 | GHSA-39q2-94rc-95cp@dompurify-3.2.6 | 3.4.0 |
| moderate | dompurify | 3.2.6 | GHSA-55q2-fjhq-7xh7@dompurify-3.2.6 | 3.4.13 |
| moderate | dompurify | 3.2.6 | GHSA-6688-9rhm-gjv2@dompurify-3.2.6 | 3.4.16 |
| moderate | dompurify | 3.2.6 | GHSA-76mc-f452-cxcm@dompurify-3.2.6 | 3.4.7 |
| moderate | dompurify | 3.2.6 | GHSA-c6gr-qvv4-5v3f@dompurify-3.2.6 | 3.4.17 |
| moderate | dompurify | 3.2.6 | GHSA-cj63-jhhr-wcxv@dompurify-3.2.6 | 3.3.2 |
| moderate | dompurify | 3.2.6 | GHSA-cjmm-f4jc-qw8r@dompurify-3.2.6 | 3.3.2 |
| moderate | dompurify | 3.2.6 | GHSA-cmwh-pvxp-8882@dompurify-3.2.6 | 3.4.11 |
| moderate | dompurify | 3.2.6 | GHSA-crv5-9vww-q3g8@dompurify-3.2.6 | 3.4.0 |
| moderate | dompurify | 3.2.6 | GHSA-h7mw-gpvr-xq4m@dompurify-3.2.6 | 3.4.0 |
| moderate | dompurify | 3.2.6 | GHSA-h8r8-wccr-v5f2@dompurify-3.2.6 | 3.3.2 |
| moderate | dompurify | 3.2.6 | GHSA-hpcv-96wg-7vj8@dompurify-3.2.6 | 3.4.6 |
| moderate | dompurify | 3.2.6 | GHSA-r47g-fvhr-h676@dompurify-3.2.6 | 3.4.6 |
| moderate | dompurify | 3.2.6 | GHSA-rp9w-3fw7-7cwq@dompurify-3.2.6 | 3.4.7 |
| moderate | dompurify | 3.2.6 | GHSA-v2wj-7wpq-c8vv@dompurify-3.2.6 | 3.3.2 |
| moderate | dompurify | 3.2.6 | GHSA-v8jm-5vwx-cfxm@dompurify-3.2.6 | 3.2.7 |
| moderate | dompurify | 3.2.6 | GHSA-v9jr-rg53-9pgp@dompurify-3.2.6 | 3.4.0 |
| moderate | dompurify | 3.2.6 | GHSA-x4vx-rjvf-j5p4@dompurify-3.2.6 | Sin corrección indicada |
| moderate | esbuild | 0.18.20 | GHSA-67mh-4wv8-2f99@esbuild-0.18.20 | 0.25.0 |
| moderate | esbuild | 0.19.12 | GHSA-67mh-4wv8-2f99@esbuild-0.19.12 | 0.25.0 |
| moderate | esbuild | 0.21.5 | GHSA-67mh-4wv8-2f99@esbuild-0.21.5 | 0.25.0 |
| moderate | esbuild | 0.23.1 | GHSA-67mh-4wv8-2f99@esbuild-0.23.1 | 0.25.0 |
| moderate | follow-redirects | 1.15.9 | GHSA-r4q5-vmmm-2653@follow-redirects-1.15.9 | 1.16.0 |
| moderate | jspdf | 3.0.1 | GHSA-cjw8-79x6-5cj4@jspdf-3.0.1 | 4.1.0 (incompatible) |
| moderate | jspdf | 3.0.1 | GHSA-vm32-vv63-w422@jspdf-3.0.1 | 4.1.0 (incompatible) |
| moderate | lodash | 4.17.21 | GHSA-f23m-r3pf-42rh@lodash-4.17.21 | 4.18.0 |
| moderate | lodash | 4.17.21 | GHSA-xxjr-mmjv-4gpg@lodash-4.17.21 | 4.17.23 |
| moderate | multer | 2.0.1 | GHSA-3p4h-7m6x-2hcm@multer-2.0.1 | 2.2.0 |
| moderate | nanoid | 3.3.17 | GHSA-2v37-7h3g-55p8@nanoid-3.3.17 | 3.3.18 |
| moderate | node-forge | 1.3.1 | GHSA-65ch-62r8-g69g@node-forge-1.3.1 | 1.3.2 |
| moderate | picomatch | 2.3.1 | GHSA-3v7f-55p6-f55p@picomatch-2.3.1 | 2.3.2 |
| moderate | postcss-selector-parser | 6.0.10 | GHSA-rj75-hqrm-r3gf@postcss-selector-parser-6.0.10 | 6.1.5 |
| moderate | postcss-selector-parser | 6.1.2 | GHSA-rj75-hqrm-r3gf@postcss-selector-parser-6.1.2 | 6.1.5 |
| moderate | postcss-selector-parser | 6.1.2 | GHSA-w9m9-85wc-3x92@postcss-selector-parser-6.1.2 | 6.1.3 |
| moderate | qs | 6.13.0 | GHSA-4mjr-xmp4-gh2g@qs-6.13.0 | 6.16.0 |
| moderate | qs | 6.13.0 | GHSA-6pq8-jhm2-2vcw@qs-6.13.0 | 6.16.1 |
| moderate | qs | 6.13.0 | GHSA-q8mj-m7cp-5q26@qs-6.13.0 | 6.15.2 |
| moderate | validator | 13.12.0 | GHSA-9965-vmph-33xx@validator-13.12.0 | 13.15.20 |
| moderate | vite | 5.4.19 | GHSA-4w7w-66w2-5vf9@vite-5.4.19 | 6.4.2 (incompatible) |
| moderate | vite | 5.4.19 | GHSA-698v-4r3x-3vcv@vite-5.4.19 | 6.4.4 (incompatible) |
| moderate | vite | 5.4.19 | GHSA-93m4-6634-74q7@vite-5.4.19 | 5.4.21 |
| moderate | vite | 5.4.19 | GHSA-fx2h-pf6j-xcff@vite-5.4.19 | 6.4.3 (incompatible) |
| moderate | vite | 5.4.19 | GHSA-r825-w8mm-5pxw@vite-5.4.19 | 6.4.4 (incompatible) |
| moderate | vite | 5.4.19 | GHSA-rq7h-c2jc-7f22@vite-5.4.19 | 6.4.4 (incompatible) |
| moderate | vite | 5.4.19 | GHSA-v6wh-96g9-6wx3@vite-5.4.19 | 6.4.3 (incompatible) |
| moderate | vite | 8.2.0 | GHSA-698v-4r3x-3vcv@vite-8.2.0 | 8.2.4 |
| moderate | vite | 8.2.0 | GHSA-r825-w8mm-5pxw@vite-8.2.0 | 8.2.4 |
| moderate | vite | 8.2.0 | GHSA-rq7h-c2jc-7f22@vite-8.2.0 | 8.2.4 |
| moderate | vite | 8.2.0 | GHSA-vfpm-58rq-9qcg@vite-8.2.0 | 8.2.4 |
| moderate | vitest | 4.1.10 | GHSA-82fw-gwwq-j7x9@vitest-4.1.10 | 4.1.11 |
| moderate | ws | 8.18.3 | GHSA-58qx-3vcg-4xpx@ws-8.18.3 | 8.20.1 |
| moderate | yaml | 2.6.0 | GHSA-48c2-rrv3-qjmp@yaml-2.6.0 | 2.8.3 |
| low | @babel/core | 7.26.0 | GHSA-4x5r-pxfx-6jf8@@babel/core-7.26.0 | 7.29.6 |
| low | axios | 1.10.0 | GHSA-xhjh-pmcv-23jw@axios-1.10.0 | 1.15.1 |
| low | body-parser | 1.20.3 | GHSA-v422-hmwv-36x6@body-parser-1.20.3 | 1.20.6 |
| low | brace-expansion | 2.0.1 | GHSA-v6h2-p8h4-qcjw@brace-expansion-2.0.1 | 2.0.2 |
| low | dompurify | 3.2.6 | GHSA-c2j3-45gr-mqc4@dompurify-3.2.6 | 3.4.12 |
| low | dompurify | 3.2.6 | GHSA-gvmj-g25r-r7wr@dompurify-3.2.6 | 3.4.8 |
| low | dompurify | 3.2.6 | GHSA-vxr8-fq34-vvx9@dompurify-3.2.6 | 3.4.9 |
| low | multer | 2.0.1 | GHSA-qvfw-j98x-7q72@multer-2.0.1 | 2.3.0 |
| low | on-headers | 1.0.2 | GHSA-76c9-3jph-rj3q@on-headers-1.0.2 | 1.1.0 |
| low | qs | 6.13.0 | GHSA-6rw7-vpxm-498p@qs-6.13.0 | 6.14.1 |
| low | qs | 6.13.0 | GHSA-w7fw-mjwx-w883@qs-6.13.0 | 6.14.2 |
| low | tmp | 0.2.3 | GHSA-52f5-9888-hmc6@tmp-0.2.3 | 0.2.4 |
| low | vite | 5.4.19 | GHSA-9jrq-w75r-8gcw@vite-5.4.19 | 6.4.4 (incompatible) |
| low | vite | 5.4.19 | GHSA-g4jq-h2w9-997c@vite-5.4.19 | 5.4.20 |
| low | vite | 5.4.19 | GHSA-jqfw-vq24-v9c3@vite-5.4.19 | 5.4.20 |
| low | vite | 8.2.0 | GHSA-9jrq-w75r-8gcw@vite-8.2.0 | 8.2.4 |

## Análisis estático

4 hallazgos de severidad MEDIUM. No se abrió ni reprodujo el contenido del archivo de respuesta de login señalado como posible JWT. El MD5 señalado se usa como eventId, no se constató un uso como hash de contraseña. Los cifrados CBC requieren análisis separado, no una sustitución automática.

| Severidad | Regla | Archivo y línea | Mensaje del escáner |
|---|---|---|---|
| MEDIUM | secrets.misc.generic_jwt.generic_jwt | login_response.json:1 | A secret is hard-coded in the application. Secrets stored in source code, such as credentials, identifiers, and other types of sensitive data, can be leaked and used by internal or external malicious actors. It is recommended to rotate the secret and retrieve them from a secure secret vault or Hardware Security Module (HSM), alternatively environment variables can be used if allowed by your company policy. |
| MEDIUM | javascript.node-stdlib.cryptography.crypto-weak-algorithm.crypto-weak-algorithm | server/security-middleware.ts:225 | The use of a weak cryptographic algorithm (e.g., SHA-1 or MD5) has been identified. These algorithms are considered insecure due to vulnerabilities that make them susceptible to collision attacks, allowing attackers to compromise data integrity or security. Replace SHA-1 or MD5 with secure hashing algorithms, such as: SHA-256 or higher (e.g., SHA-3). |
| MEDIUM | javascript.crypto.weak-symmetric-mode.weak-symmetric-mode | shared/security-engine.ts:66 | Detected the use of `createCipher("aes-256-cbc")` which is considered a weak cryptographic mode. Where possible, leverage the industry standard recommendation which is to use a block cipher such as `AES` with at least `128-bit` strength, an example of a secure algorithm is `AES-256-GCM`. If your company has its own guidelines, you should follow your company's internal best practices. |
| MEDIUM | javascript.crypto.weak-symmetric-mode.weak-symmetric-mode | shared/security-engine.ts:106 | Detected the use of `createDecipher("aes-256-cbc")` which is considered a weak cryptographic mode. Where possible, leverage the industry standard recommendation which is to use a block cipher such as `AES` with at least `128-bit` strength, an example of a secure algorithm is `AES-256-GCM`. If your company has its own guidelines, you should follow your company's internal best practices. |

## Privacidad

12 hallazgos: 4 CRITICAL, 2 MEDIUM y 6 LOW. Los críticos apuntan a tokens en localStorage de pruebas y registros de contraseñas en scripts de penetración. No se reprodujeron valores de tokens o contraseñas y no se ejecutaron esos scripts. No se verificó si estos scripts se usan fuera de pruebas.

| Severidad | Regla | Archivo y línea | Mensaje del escáner |
|---|---|---|---|
| LOW | EMAIL | e2e/19-asistente-claude-real.spec.ts:399 | Email sent to Local Storage |
| MEDIUM | IP-ADDRESS | server/websocket-manager.ts:54 | IP Address sent to Standard Output |
| CRITICAL | AUTH-TOKEN | e2e/19-asistente-claude-real.spec.ts:271 | Auth Token sent to Local Storage |
| LOW | EMAIL | security-penetration-test.js:283 | Email sent to Standard Output |
| CRITICAL | PASSWORD | penetration-test-simple.js:99 | Password sent to Standard Output |
| CRITICAL | PASSWORD | security-penetration-test.js:114 | Password sent to Standard Output |
| CRITICAL | AUTH-TOKEN | e2e/19-asistente-claude-real.spec.ts:397 | Auth Token sent to Local Storage |
| LOW | EMAIL | test-role-based-filtering.js:50 | Email sent to Standard Output |
| LOW | EMAIL | e2e/16-admin-rate-limit-navigation.spec.ts:81 | Email sent to Local Storage |
| LOW | USERNAME | test-verificacion-perfiles.js:66 | Username sent to Standard Output |
| MEDIUM | IP-ADDRESS | shared/security-engine.ts:609 | IP Address sent to Standard Error |
| LOW | EMAIL | e2e/19-asistente-claude-real.spec.ts:273 | Email sent to Local Storage |

Son hallazgos del escáner, no una declaración de explotabilidad confirmada ni una aceptación del riesgo. No se corrigieron fuera del alcance autorizado.
