# RC1 security, privacy and rights review

> Historical RC1 audit. V4 subsequently created a separate public source repository and an authenticated HTTPS preview. See [PUBLICATION_V4.md](PUBLICATION_V4.md) and `release/evidence/public-v4-security.json` for the current publication. The original research repository remains private.

The development repository remains private. No visibility change, public repository creation, deployment, billing activation or VM creation occurred. `main` is unchanged. A clean candidate is an export for review, not a publication.

## Full reachable history

`scripts/audit-release-history.py` reads every object reachable from every local/remote-tracking ref with `git cat-file --batch`, including commit metadata. Initial scan: 93 refs, 140 commits, 830 trees, 2,143 blobs, 789,892,858 bytes; 14.32 s. It found zero candidate secrets for private keys, Google/GitHub tokens, service-account declarations, AWS IDs and JWT patterns; 13 objects with personal-machine paths and 186 media objects requiring licence classification. No non-noreply author email was found. Post-implementation scan of `05575dd77d9acf8c3ae7cf8f0c00883e78ab66f1`: 141 commits, 849 trees, 2,213 blobs, 796,327,867 bytes; zero candidate secrets, 13 machine-path objects, 199 media objects needing rights classification, zero non-noreply emails. [Exact scope and limitations](../release/evidence/history-audit.json). This receipt commit is later than the audited implementation commit.

This is not proof of absence of every secret. Unreachable objects, reflogs, private remote hidden refs and unrecognized secret formats are outside the export scope. No raw matched value is printed. Historical media and private-machine paths make wholesale public exposure inappropriate even with zero credential-pattern hits. Preserve the private history; publish only an approved clean distribution.

## Distribution boundary

`scripts/prepare-public-candidate.py` builds a new directory under `.local/release/` from an explicit allowlist of runtime code, configurations, required assets, release documentation and screened evidence. It excludes `.git`, arbitrary `.local`, raw HTTP/session data, historical photo/video experiments and their source pixels. It stops on machine-path/credential patterns and records hashes of exported files. It never deletes or rewrites the research history and never pushes or changes visibility.

The candidate omits private photo-localization assets; thus it cannot reproduce the inherited P1+M+ photo demonstration until rights are resolved. That limitation is disclosed in installation and UI. The 3D catalogue has pinned local-restoration recipes; restored results are not new automatic-discovery claims.

## Rights matrix

| Material | Evidence and disposition |
|---|---|
| Inside the Circuit original code | Existing MIT retained |
| Historical Kiro dependency closure | Owner-authorized reuse; original upstream had no root licence at reviewed commit. Keep provenance/notices; do not imply a third-party open licence |
| Pi 5 CAD / official graphics | Manufacturer MIT notice retained with source hashes; permitted derived GLB and graphics |
| Arduino PCB contacts / artwork | CC BY-SA 4.0 hardware archive statement preserved in asset directories; derivatives retain attribution/share-alike |
| Arduino STEP conversion | Separate archive lacks embedded licence; do not distribute generated model in clean seed; download official archive locally and convert |
| Coral mechanical/electrical data | Apache-2.0 confirmed in both pinned repositories. Model/surface adaptations labelled, licence included in `release/catalog` |
| Motor official product photos | No affirmative redistribution grant established. Exclude original photos, textured model and screenshots containing these pixels from clean publication. Local pinned download/regeneration recipe only |
| Independent book code/text | No selected open licence in reviewed public README; embed/link only, no copied engine/assets |
| Roboto | SIL OFL 1.1 notice retained |
| Three.js, esbuild | MIT; package/bundle notices retained |
| Firebase SDK, sharp | Apache-2.0; installed package notices and transitive native licences retained |
| Open CASCADE / cadquery-ocp / VTK | Separate upstream dependency licences; not relicensed by project MIT |
| PyMuPDF document extraction | AGPL/commercial. Not covered by MIT; deployment/distribution compliance needs review before a public service |

Sources: pinned manufacturer URLs and hashes in the catalogue/asset registries; [Coral mechanicals licence](https://github.com/google-coral/mechanicals/blob/be47f619f5cb43b1fb19973abe988b733ed16560/LICENSE), [Coral electricals licence](https://github.com/google-coral/electricals/blob/7250d49a08a296fb9aaabb2415b6c0e73355914a/LICENSE). Product photographs do not inherit a firmware repository's software licence. Colour resemblance does not establish material chemistry.

## Cloud/App Check

The browser adapter requires configuration, capability/consent, request allowance and App Check token acquisition. It preserves actual `inferenceSource`. Server-side App Check enforcement was historically observed as ENFORCED in the lab; RC1 does not claim a fresh authenticated server-enforcement test. The previous lab was closed at 2026-11-25 21:49:44 UTC with `billingEnabled:false`, zero temporary resources and revoked temporary app/key/debug token. No new paid call occurred in RC1; the previous measured no-CAD charge estimate was US$0.2746238, not a new allowance or final bill.

A deployment must recheck App Check enforcement, authorized domains/API restrictions, backend access controls, usage/budget telemetry and revocation. A budget alert cannot stop all charges, and browser sessionStorage is not an enforceable account-wide quota. Do not enable public Cloud inference on those guards alone.

## Approval boundary

Review the clean candidate, remaining asset rights, manual demo checks and deployment plan before authorizing public visibility or hosting. No approval is needed merely to inspect the local candidate. The research repository and `main` remain preserved.
