# Kit reproduction validation (SPEC 5.6)

Engine re-ran 61 SBT kits with every row unlocked (domain = catalogue metals for the clone + the kit's own metal),
pdv2 weights (pure sum received SO / T), default reserved channels, seed 1. `def` columns use the default soft weights (w_sens 0.2).

* engine better than kit: **45**, equal: **16**, worse: **0** (none)
* total engine time: 639 ms (10 ms per kit, 3 restarts x 20k iterations)

| Kit | App | Instrument | Rows | Kit SO/T | Kit worst row | Engine SO/T | Engine worst row | Moves | Def SO/T | Def moves |
|---|---|---|---:|---:|---|---:|---|---:|---:|---:|
| T-cell complete IO | suspension | cytof_xt | 34 | 30.20 | CD152/CTLA-4 (14D3) 7.85 | 7.85 | CD161 (HP-3G10) 1.20 | 15 | 7.85 | 15 |
| T-cell basic IO | suspension | cytof_xt | 24 | 22.14 | CD152/CTLA-4 (14D3) 7.70 | 1.65 | CD278/ICOS (C398.4A) 0.35 | 12 | 1.62 | 13 |
| T-cell checkpoint and cytokine (40-marker) | suspension | cytof_xt | 40 | 18.46 | LAP/TGFβ (S20006A) 4.62 | 10.35 | IL-21 (3A3-N2) 1.28 | 13 | 10.31 | 14 |
| Broad immune checkpoint (34-marker) | suspension | cytof_xt | 34 | 13.27 | CD357/GITR (108-17) 2.28 | 9.73 | CD134/OX40 (ACT35) 1.53 | 15 | 8.81 | 12 |
| Direct Immune Profiling Assay (MDIPA) | suspension | cytof_xt | 30 | 10.79 | CD66b (G10F5) 2.49 | 4.77 | IgD (IA6-2) 1.30 | 12 | 4.44 | 14 |
| Direct Immune Profiling Assay (legacy) | suspension | cytof_xt | 24 | 8.41 | CD66b (G10F5) 2.49 | 2.90 | TCRγδ (B1) 0.45 | 12 | 2.90 | 12 |
| AML phenotyping | suspension | cytof_xt | 15 | 7.17 | CD38 (HIT2) 5.86 | 0.08 | CD64 (10.1) 0.05 | 11 | 0.09 | 11 |
| Immuno-oncology (31-marker master panel) | imaging | hyperion_xti | 31 | 4.40 | CD57 (NK/804) 0.76 | 2.92 | CD8a (C8/144B) 0.30 | 11 | 2.97 | 9 |
| Cytokine I | suspension | cytof_xt | 11 | 3.65 | IL-17F (SHLR17) 1.61 | 0.26 | IL-2 (MQ1-17H12) 0.15 | 7 | 0.26 | 6 |
| Neuro-oncology bundle | imaging | hyperion_xti | 24 | 3.19 | S100β (EP1576Y) 0.49 | 1.62 | S100β (EP1576Y) 0.23 | 14 | 1.63 | 13 |
| Monocyte / macrophage phenotyping | suspension | cytof_xt | 15 | 2.86 | CD163/M130 (GHI/61) 0.70 | 0.09 | CD19 (HIB19) 0.05 | 13 | 0.09 | 13 |
| T helper phenotyping | suspension | cytof_xt | 15 | 2.56 | CD279/PD-1 (EH12.2H7) 0.96 | 0.39 | CD45RA (HI100) 0.10 | 7 | 0.39 | 7 |
| T-cell phenotyping | suspension | cytof_xt | 16 | 2.10 | CD25/IL2Rα (2A3) 0.90 | 0.35 | CD27 (O323) 0.20 | 10 | 0.35 | 10 |
| Broad immune profiling | suspension | cytof_xt | 20 | 2.05 | CD28 (CD28.2) 0.30 | 0.49 | CD27 (L128) 0.07 | 11 | 0.49 | 11 |
| ES / iPS pluripotency | suspension | cytof_xt | 6 | 1.98 | TRA-1-60 (TRA-1-60) 1.98 | 1.98 | TRA-1-60 (TRA-1-60) 1.98 | 1 | 1.98 | 1 |
| MDIPA expansion - myeloid / B cell 2 | suspension | cytof_xt | 7 | 1.42 | CD279/PD-1 (EH12.2H7) 1.42 | 0.00 | CD40 (5C3) 0.00 | 3 | 0.00 | 5 |
| MDIPA expansion - myeloid / B cell 1 | suspension | cytof_xt | 7 | 1.42 | CD279/PD-1 (EH12.2H7) 1.42 | 0.00 | CD181/CXCR1 (8F1/CXCR1) 0.00 | 4 | 0.00 | 4 |
| HSPC phenotyping | suspension | cytof_xt | 7 | 1.25 | CD138/SDC1 (DL-101) 1.25 | 0.02 | CD117/c-kit (104D2) 0.01 | 3 | 0.02 | 2 |
| Immuno-oncology kit (16) | imaging | hyperion_xti | 16 | 1.13 | Ki-67 (B56) 0.26 | 0.13 | CD8a (C8/144B) 0.03 | 10 | 0.14 | 10 |
| T-cell profiling | suspension | cytof_xt | 10 | 1.10 | CD127/IL7Rα (A019D5) 0.59 | 0.07 | CD28 (CD28.2) 0.03 | 4 | 0.08 | 4 |
| Immune checkpoint expansion 2 | suspension | cytof_xt | 3 | 0.93 | CD357/GITR (108-17) 0.93 | 0.00 | CD278/ICOS (C398.4A) 0.00 | 1 | 0.00 | 1 |
| MDIPA expansion - basic activation | suspension | cytof_xt | 6 | 0.92 | Perforin (B-D48) 0.70 | 0.00 | CD107a/LAMP1 (H4A3) 0.00 | 4 | 0.00 | 5 |
| Peripheral blood phenotyping | suspension | cytof_xt | 16 | 0.92 | CD16 (3G8) 0.16 | 0.13 | CD3ε (UCHT1) 0.04 | 7 | 0.13 | 7 |
| B-cell phenotyping | suspension | cytof_xt | 12 | 0.90 | CD21/CD35 (BL13) 0.28 | 0.66 | IgM (MHM-88) 0.23 | 5 | 0.66 | 5 |
| Cell signalling | imaging | hyperion_xti | 7 | 0.87 | pTYR (TYR-100) 0.29 | 0.61 | pTYR (TYR-100) 0.29 | 2 | 0.61 | 2 |
| Cell metabolism | imaging | hyperion_xti | 7 | 0.87 | CPT1A​ (EPR21843-71-1C) 0.29 | 0.62 | CPT1A​ (EPR21843-71-1C) 0.29 | 1 | 0.62 | 1 |
| Immune cell expansion | imaging | hyperion_xti | 7 | 0.87 | CD16 (EPR16784) 0.29 | 0.06 | CD38 (E7Z8C) 0.04 | 3 | 0.06 | 3 |
| Neurophenotyping kit | imaging | hyperion_xti | 7 | 0.87 | S100β (EP1576Y) 0.29 | 0.00 | Iba1 (EPR16588) 0.00 | 6 | 0.00 | 6 |
| Cytotoxic mediators | suspension | cytof_xt | 3 | 0.71 | Perforin (B-D48) 0.70 | 0.00 | IL-6 (MQ2-13A5) 0.00 | 2 | 0.00 | 3 |
| Peripheral blood basic II | suspension | cytof_xt | 7 | 0.66 | CD16 (3G8) 0.35 | 0.00 | CD4 (RPA-T4) 0.00 | 5 | 0.00 | 5 |
| T-cell phenotyping expansion | suspension | cytof_xt | 10 | 0.54 | CD195/CCR5 (NP-6G4) 0.33 | 0.31 | CD161 (HP-3G10) 0.15 | 4 | 0.31 | 4 |
| TBMNK + granulocytes | suspension | cytof_xt | 9 | 0.50 | CD19 (HIB19) 0.21 | 0.00 | CD45 (HI30) 0.00 | 6 | 0.00 | 6 |
| Regulatory T cells | suspension | cytof_xt | 13 | 0.46 | CD45RA (HI100) 0.10 | 0.15 | CD25/IL2Rα (2A3) 0.04 | 8 | 0.15 | 8 |
| Immune checkpoint core | suspension | cytof_xt | 9 | 0.45 | CD274/PD-L1 (MIH1) 0.14 | 0.00 | CD154/CD40L (24-31) 0.00 | 5 | 0.00 | 8 |
| Cytokine expansion | suspension | cytof_xt | 3 | 0.42 | IL-10 (JES3-9D7) 0.27 | 0.00 | IL-5 (TRFK5) 0.00 | 2 | 0.00 | 2 |
| Lymphoid | imaging | hyperion_xti | 4 | 0.41 | CD8a (C8/144B) 0.34 | 0.00 | CD4 (EPR6855) 0.00 | 3 | 0.00 | 3 |
| Tumour-infiltrating lymphocytes kit | imaging | hyperion_xti | 8 | 0.34 | CD8a (C8/144B) 0.16 | 0.00 | Pan-Cytokeratin (C11) 0.00 | 5 | 0.03 | 4 |
| T-cell exhaustion | imaging | hyperion_xti | 5 | 0.31 | CD152/CTLA-4 (BLR257L) 0.19 | 0.27 | CD152/CTLA-4 (BLR257L) 0.19 | 1 | 0.27 | 1 |
| Immune activation kit | imaging | hyperion_xti | 4 | 0.25 | Ki-67 (B56) 0.19 | 0.00 | CD274/PD-L1 (SP142) 0.00 | 1 | 0.00 | 1 |
| Functional state | imaging | hyperion_xti | 5 | 0.20 | CD274/PD-L1 (73-10) 0.18 | 0.00 | Ki-67 (B56) 0.00 | 2 | 0.00 | 3 |
| Cytokine core | suspension | cytof_xt | 5 | 0.18 | TNFα (Mab11) 0.11 | 0.00 | IL-2 (MQ1-17H12) 0.00 | 4 | 0.00 | 5 |
| Peripheral blood basic | suspension | cytof_xt | 7 | 0.12 | CD3ε (UCHT1) 0.08 | 0.00 | CD20 (2H7) 0.00 | 5 | 0.00 | 4 |
| MDIPA expansion - T cell 2 | suspension | cytof_xt | 7 | 0.12 | CD184/CXCR4 (12G5) 0.12 | 0.00 | CD11a (HI111) 0.00 | 3 | 0.00 | 3 |
| Myeloid / macrophages | imaging | hyperion_xti | 6 | 0.09 | CD66b (BLR111H) 0.05 | 0.00 | CD11b/Mac-1 (EPR1344) 0.00 | 3 | 0.00 | 4 |
| T-cell IO expansion | suspension | cytof_xt | 8 | 0.09 | CD366/TIM-3 (F38-2E2) 0.05 | 0.00 | CD134/OX40 (ACT35) 0.00 | 7 | 0.00 | 5 |
| Signalling I | suspension | cytof_xt | 7 | 0.05 | p38 [T180/Y182] (D3F9) 0.04 | 0.05 | p38 [T180/Y182] (D3F9) 0.04 | 2 | 0.05 | 1 |
| Stromal | imaging | hyperion_xti | 4 | 0.03 | Podoplanin (D2-40) 0.03 | 0.03 | Podoplanin (D2-40) 0.03 | 1 | 0.03 | 0 |
| MDIPA expansion - T cell 3 | suspension | cytof_xt | 7 | 0.00 | CD278/ICOS (C398.4A) 0.00 | 0.00 | CD134/OX40 (ACT35) 0.00 | 6 | 0.00 | 4 |
| Neuro expansion | imaging | hyperion_xti | 3 | 0.00 | β III Tubulin (TuJ1) 0.00 | 0.00 | β III Tubulin (TuJ1) 0.00 | 1 | 0.00 | 2 |
| Glioblastoma | imaging | hyperion_xti | 5 | 0.00 | Nestin (EPR27207-53) 0.00 | 0.00 | Nestin (EPR27207-53) 0.00 | 1 | 0.00 | 0 |
| Synuclein / tau mixed pathology | imaging | hyperion_xti | 4 | 0.00 | Tau (D1M9X) 0.00 | 0.00 | Tau (D1M9X) 0.00 | 3 | 0.00 | 3 |
| Proteinopathies | imaging | hyperion_xti | 5 | 0.00 | APP (4G8) 0.00 | 0.00 | APP (4G8) 0.00 | 0 | 0.00 | 5 |
| Multiple sclerosis | imaging | hyperion_xti | 3 | 0.00 | Neurofilament (SMI 312) 0.00 | 0.00 | Neurofilament (SMI 312) 0.00 | 0 | 0.00 | 2 |
| Alzheimer's disease | imaging | hyperion_xti | 3 | 0.00 | APP (4G8) 0.00 | 0.00 | APP (4G8) 0.00 | 1 | 0.00 | 2 |
| Parkinson's disease | imaging | hyperion_xti | 3 | 0.00 | αSyn (E4U2F) 0.00 | 0.00 | αSyn (E4U2F) 0.00 | 2 | 0.00 | 1 |
| Basic immune | imaging | hyperion_xti | 4 | 0.00 | CD20 (H1) 0.00 | 0.00 | CD20 (H1) 0.00 | 2 | 0.00 | 1 |
| Tissue architecture | imaging | hyperion_xti | 3 | 0.00 | Collagen Type I (Polyclonal) 0.00 | 0.00 | Collagen Type I (Polyclonal) 0.00 | 2 | 0.00 | 1 |
| Epithelial / mesenchymal | imaging | hyperion_xti | 4 | 0.00 | Vimentin (D21H3) 0.00 | 0.00 | Vimentin (D21H3) 0.00 | 3 | 0.00 | 0 |
| Tissue architecture kit (5) | imaging | hyperion_xti | 5 | 0.00 | α-Smooth Muscle Actin (1A4) 0.00 | 0.00 | α-Smooth Muscle Actin (1A4) 0.00 | 2 | 0.00 | 3 |
| Immune checkpoint expansion 1 | suspension | cytof_xt | 3 | 0.00 | CD244/2B4 (PP35) 0.00 | 0.00 | CD244/2B4 (PP35) 0.00 | 2 | 0.00 | 1 |
| Cell cycle | suspension | cytof_xt | 4 | 0.00 | pRb [S807/S811] (J112-906) 0.00 | 0.00 | pRb [S807/S811] (J112-906) 0.00 | 1 | 0.00 | 3 |

## Per-kit moves (pdv2 weights)

### T-cell complete IO (suspension, cytof_xt) - kit 30.20 -> engine 7.85
* CD195/CCR5 (NP-6G4): 144 -> 156Gd
* CD4 (RPA-T4): 145 -> 176Yb
* CD25/IL2Rα (2A3): 149 -> 169Tm
* CD134/OX40 (ACT35): 150 -> 158Gd
* CD366/TIM-3 (F38-2E2): 153 -> 154Sm
* CD45 (HI30): 154 -> 89Y
* CD183/CXCR3 (G025H7): 156 -> 163Dy
* CD194/CCR4 (L291H4): 158 -> 153Eu
* CD69 (FN50): 162 -> 113In
* CD45RO (UCHL1): 165 -> 149Sm
* CD278/ICOS (C398.4A): 168 -> 175Lu
* CD45RA (HI100): 169 -> 150Nd
* CD137/4-1BB (4B4-1): 173 -> 209Bi
* CD223/LAG-3 (11C3C65): 175 -> 165Ho
* CD127/IL7Rα (A019D5): 176 -> 168Er

### T-cell basic IO (suspension, cytof_xt) - kit 22.14 -> engine 1.65
* CD4 (RPA-T4): 145 -> 176Yb
* CD16 (3G8): 148 -> 209Bi
* CD134/OX40 (ACT35): 150 -> 158Gd
* CD45 (HI30): 154 -> 196Pt
* CD69 (FN50): 162 -> 113In
* CD45RO (UCHL1): 165 -> 150Nd
* CD278/ICOS (C398.4A): 168 -> 175Lu
* CD3ε (UCHT1): 170 -> 141Pr
* CD57 (HCD57): 172 -> 163Dy
* HLA-DR (L243): 174 -> 170Er
* CD223/LAG-3 (11C3C65): 175 -> 172Yb
* CD127/IL7Rα (A019D5): 176 -> 165Ho

### T-cell checkpoint and cytokine (40-marker) (suspension, cytof_xt) - kit 18.46 -> engine 10.35
* kit uses reserved mass(es) 195, 198: released for this run
* IL-2 (MQ1-17H12): 112 -> 158Gd
* CD8a (SK1): 142 -> 112Cd
* IL-10 (JES3-9D7): 148 -> 165Ho
* CD56/NCAM (NCAM16.2): 149 -> 176Yb
* CD45RA (HI100): 150 -> 170Er
* CD366/TIM-3 (F38-2E2): 154 -> 169Tm
* CD134/OX40 (ACT35): 158 -> 150Nd
* CD152/CTLA-4 (14D3): 162 -> 142Nd
* CD45RO (UCHL1): 163 -> 149Sm
* CD197/CCR7 (G043H7): 167 -> 159Tb
* CD3ε (UCHT1): 170 -> 154Sm
* CD95/Fas (DX2): 176 -> 162Dy
* Perforin (B-D48): 196 -> 175Lu

### Broad immune checkpoint (34-marker) (suspension, cytof_xt) - kit 13.27 -> engine 9.73
* CD8a (SK1): 142 -> 112Cd
* CD154/CD40L (24-31): 143 -> 168Er
* CD19 (HIB19): 145 -> 142Nd
* CD278/ICOS (C398.4A): 148 -> 143Nd
* CD56/NCAM (NCAM16.2): 149 -> 163Dy
* CD45RA (HI100): 150 -> 155Gd
* CD366/TIM-3 (F38-2E2): 154 -> 169Tm
* CD27 (L128): 155 -> 167Er
* CD152/CTLA-4 (14D3): 162 -> 170Er
* CD45RO (UCHL1): 163 -> 150Nd
* CD197/CCR7 (G043H7): 167 -> 159Tb
* CD127/IL7Rα (A019D5): 168 -> 149Sm
* CD3ε (UCHT1): 170 -> 154Sm
* CD137/4-1BB (4B4-1): 173 -> 209Bi
* CD16 (3G8): 209 -> 145Nd

### Direct Immune Profiling Assay (MDIPA) (suspension, cytof_xt) - kit 10.79 -> engine 4.77
* CD45 (HI30): 89 -> 114Cd
* CD19 (HIB19): 144 -> 142Nd
* CD4 (RPA-T4): 145 -> 176Yb
* CD16 (3G8): 148 -> 209Bi
* CD45RO (UCHL1): 149 -> 163Dy
* CD45RA (HI100): 150 -> 169Tm
* CD161 (HP-3G10): 151 -> 159Tb
* CD194/CCR4 (L291H4): 152 -> 175Lu
* CD56/NCAM (NCAM16.2): 163 -> 149Sm
* CD14 (63D3): 168 -> 151Eu
* CD66b (G10F5): 172 -> 152Sm
* CD127/IL7Rα (A019D5): 176 -> 165Ho

### Direct Immune Profiling Assay (legacy) (suspension, cytof_xt) - kit 8.41 -> engine 2.90
* skipped rows: CD194/CCR4 (antibody/any); CD294/CRTH2 (antibody/any); CD27 (antibody/any); CD57 (antibody/any); CD19 (antibody/any); CD185/CXCR5 (antibody/any)
* CD45 (HI30): 89 -> 110Cd
* CD4 (RPA-T4): 145 -> 176Yb
* CD8a (RPA-T8): 146 -> 162Dy
* CD16 (3G8): 148 -> 209Bi
* CD45RO (UCHL1): 149 -> 165Ho
* CD45RA (HI100): 150 -> 169Tm
* CD161 (HP-3G10): 151 -> 159Tb
* CD56/NCAM (NCAM16.2): 163 -> 149Sm
* CD14 (63D3): 168 -> 151Eu
* CD66b (G10F5): 172 -> 152Sm
* IgD (IA6-2): 174 -> 146Nd
* CD127/IL7Rα (A019D5): 176 -> 168Er

### AML phenotyping (suspension, cytof_xt) - kit 7.17 -> engine 0.08
* CD19 (HIB19): 142 -> 165Ho
* CD11b/Mac-1 (ICRF44): 144 -> 209Bi
* CD45 (HI30): 154 -> 196Pt
* CD33 (WM53): 158 -> 111Cd
* CD15/SSEA-1 (W6D3): 164 -> 172Yb
* CD34 (581): 166 -> 163Dy
* CD3ε (UCHT1): 170 -> 141Pr
* CD44 (IM7): 171 -> 106Cd
* CD38 (HIT2): 172 -> 167Er
* HLA-DR (L243): 174 -> 176Yb
* CD184/CXCR4 (12G5): 175 -> 156Gd

### Immuno-oncology (31-marker master panel) (imaging, hyperion_xti) - kit 4.40 -> engine 2.92
* Pan-Cytokeratin (AE-1/AE-3): 141 -> 142Nd
* CD11b/Mac-1 (EPR1344): 144 -> 149Sm
* Vimentin (D21H3): 149 -> 143Nd
* Ki-67 (B56): 150 -> 168Er
* CD31/PECAM-1 (EPR3094): 151 -> 146Nd
* E-Cadherin (24E10): 158 -> 174Yb
* CD8a (C8/144B): 162 -> 167Er
* CD57 (NK/804): 163 -> 145Nd
* CD274/PD-L1 (73-10): 166 -> 150Nd
* CD326/EpCAM (EPR20532-222): 172 -> 141Pr
* HLA-DR (LN3): 174 -> 151Eu

### Cytokine I (suspension, cytof_xt) - kit 3.65 -> engine 0.26
* IL-5 (TRFK5): 143 -> 151Eu
* MIP1β (D21-1351): 150 -> 160Gd
* TNFα (Mab11): 152 -> 175Lu
* IL-6 (MQ2-13A5): 156 -> 106Cd
* IFNγ (B27): 168 -> 116Cd
* Granzyme B (GB11): 171 -> 173Yb
* Perforin (B-D48): 175 -> 196Pt

### Neuro-oncology bundle (imaging, hyperion_xti) - kit 3.19 -> engine 1.62
* α-Smooth Muscle Actin (1A4): 141 -> 209Bi
* Vimentin (D21H3): 143 -> 149Sm
* Pan-Cytokeratin (C11): 148 -> 174Yb
* CD4 (EPR6855): 156 -> 169Tm
* CD68 (KP1): 159 -> 141Pr
* NeuN (EPR12763): 160 -> 145Nd
* CD20 (H1): 161 -> 115In
* GFAP (GA5): 163 -> 143Nd
* Granzyme B (EPR20129-217): 167 -> 175Lu
* Ki-67 (B56): 168 -> 172Yb
* Collagen Type I (Polyclonal): 169 -> 89Y
* Olig2 (EPR2673): 172 -> 168Er
* CD45RO (UCHL1): 173 -> 166Er
* MAP2 (EPR19691): 175 -> 148Nd

### Monocyte / macrophage phenotyping (suspension, cytof_xt) - kit 2.86 -> engine 0.09
* CD19 (HIB19): 142 -> 165Ho
* CD11b/Mac-1 (ICRF44): 144 -> 114Cd
* CD7 (CD7-6B7): 147 -> 153Eu
* CD36 (5-271): 152 -> 155Gd
* CD163/M130 (GHI/61): 154 -> 145Nd
* CD45 (HI30): 156 -> 196Pt
* CD11c (Bu15): 159 -> 162Dy
* CD14 (M5E2): 160 -> 175Lu
* CD16 (3G8): 165 -> 209Bi
* CD38 (HIT2): 167 -> 172Yb
* CD33 (WM53): 169 -> 158Gd
* CD3ε (UCHT1): 170 -> 141Pr
* HLA-DR (L243): 174 -> 143Nd

### T helper phenotyping (suspension, cytof_xt) - kit 2.56 -> engine 0.39
* CD195/CCR5 (NP-6G4): 144 -> 156Gd
* CD278/ICOS (C398.4A): 151 -> 175Lu
* CD183/CXCR3 (G025H7): 156 -> 163Dy
* CD45RO (UCHL1): 165 -> 150Nd
* CD4 (SK3): 174 -> 144Nd
* CD279/PD-1 (EH12.2H7): 175 -> 165Ho
* CD127/IL7Rα (A019D5): 176 -> 168Er

### T-cell phenotyping (suspension, cytof_xt) - kit 2.10 -> engine 0.35
* CD8a (RPA-T8): 146 -> 162Dy
* CD16 (3G8): 148 -> 209Bi
* CD25/IL2Rα (2A3): 149 -> 169Tm
* CD45 (HI30): 154 -> 89Y
* CD69 (FN50): 162 -> 113In
* CD45RO (UCHL1): 165 -> 149Sm
* CD45RA (HI100): 169 -> 153Eu
* CD3ε (UCHT1): 170 -> 141Pr
* HLA-DR (L243): 174 -> 176Yb
* CD127/IL7Rα (A019D5): 176 -> 165Ho

### Broad immune profiling (suspension, cytof_xt) - kit 2.05 -> engine 0.49
* CD45 (HI30): 89 -> 196Pt
* CD8a (SK1): 142 -> 112Cd
* CD123/IL-3R (6H6): 143 -> 151Eu
* CD4 (SK3): 144 -> 174Yb
* CD19 (HIB19): 145 -> 142Nd
* CD11c (Bu15): 147 -> 159Tb
* CD45RA (HI100): 150 -> 155Gd
* CD161 (HP-3G10): 151 -> 164Dy
* CD27 (L128): 155 -> 167Er
* CD20 (2H7): 156 -> 171Yb
* CD45RO (UCHL1): 163 -> 165Ho

### ES / iPS pluripotency (suspension, cytof_xt) - kit 1.98 -> engine 1.98
* CD44 (IM7): 171 -> 106Cd

### MDIPA expansion - myeloid / B cell 2 (suspension, cytof_xt) - kit 1.42 -> engine 0.00
* CD80/B7-1 (2D10.4): 162 -> 161Dy
* CD279/PD-1 (EH12.2H7): 175 -> 155Gd
* CD11b/Mac-1 (ICRF44): 209 -> 114Cd

### MDIPA expansion - myeloid / B cell 1 (suspension, cytof_xt) - kit 1.42 -> engine 0.00
* CD80/B7-1 (2D10.4): 162 -> 161Dy
* CD33 (WM53): 169 -> 111Cd
* CD279/PD-1 (EH12.2H7): 175 -> 155Gd
* CD11b/Mac-1 (ICRF44): 209 -> 167Er

### HSPC phenotyping (suspension, cytof_xt) - kit 1.25 -> engine 0.02
* CD10 (HI10a): 156 -> 158Gd
* CD138/SDC1 (DL-101): 168 -> 145Nd
* CD184/CXCR4 (12G5): 175 -> 173Yb

### Immuno-oncology kit (16) (imaging, hyperion_xti) - kit 1.13 -> engine 0.13
* α-Smooth Muscle Actin (1A4): 141 -> 153Eu
* Pan-Cytokeratin (C11): 148 -> 162Dy
* CD4 (EPR6855): 156 -> 169Tm
* CD68 (KP1): 159 -> 141Pr
* CD20 (H1): 161 -> 115In
* CD8a (C8/144B): 162 -> 167Er
* Granzyme B (EPR20129-217): 167 -> 175Lu
* Ki-67 (B56): 168 -> 172Yb
* Collagen Type I (Polyclonal): 169 -> 89Y
* CD45RO (UCHL1): 173 -> 165Ho

### T-cell profiling (suspension, cytof_xt) - kit 1.10 -> engine 0.07
* CD45RA (HI100): 150 -> 169Tm
* CD161 (HP-3G10): 151 -> 164Dy
* CD45RO (UCHL1): 163 -> 149Sm
* CD127/IL7Rα (A019D5): 168 -> 143Nd

### Immune checkpoint expansion 2 (suspension, cytof_xt) - kit 0.93 -> engine 0.00
* CD278/ICOS (C398.4A): 148 -> 143Nd

### MDIPA expansion - basic activation (suspension, cytof_xt) - kit 0.92 -> engine 0.00
* kit uses reserved mass(es) 198: released for this run
* IL-2 (MQ1-17H12): 112 -> 144Nd
* TNFα (Mab11): 114 -> 152Sm
* Perforin (B-D48): 196 -> 175Lu
* Granzyme B (GB11): 198 -> 171Yb

### Peripheral blood phenotyping (suspension, cytof_xt) - kit 0.92 -> engine 0.13
* CD19 (HIB19): 142 -> 169Tm
* CD8a (RPA-T8): 146 -> 162Dy
* CD16 (3G8): 148 -> 209Bi
* CD45 (HI30): 154 -> 89Y
* CD11c (Bu15): 159 -> 147Sm
* CD45RA (HI100): 169 -> 143Nd
* CD3ε (UCHT1): 170 -> 154Sm

### B-cell phenotyping (suspension, cytof_xt) - kit 0.90 -> engine 0.66
* CD19 (HIB19): 142 -> 165Ho
* CD20 (2H7): 147 -> 156Gd
* CD27 (L128): 155 -> 167Er
* CD38 (HIT2): 167 -> 144Nd
* HLA-DR (L243): 174 -> 176Yb

### Cell signalling (imaging, hyperion_xti) - kit 0.87 -> engine 0.61
* EGFR (D38B1): 142 -> 172Yb
* pERK1/2 [T202/Y204] (D13.14.4E): 167 -> 161Dy

### Cell metabolism (imaging, hyperion_xti) - kit 0.87 -> engine 0.62
* pS6 [S235/S236] (N7-548): 168 -> 175Lu

### Immune cell expansion (imaging, hyperion_xti) - kit 0.87 -> engine 0.06
* CD7 (EPR4242): 143 -> 175Lu
* CD16 (EPR16784): 146 -> 153Eu
* iNOS (SP126): 168 -> 160Gd

### Neurophenotyping kit (imaging, hyperion_xti) - kit 0.87 -> engine 0.00
* Iba1 (EPR16588): 142 -> 168Er
* NeuN (EPR12763): 145 -> 160Gd
* S100β (EP1576Y): 146 -> 164Dy
* MAP2 (EPR19691): 148 -> 175Lu
* CD34 (EP373Y): 167 -> 151Eu
* Olig2 (EPR2673): 168 -> 172Yb

### Cytotoxic mediators (suspension, cytof_xt) - kit 0.71 -> engine 0.00
* kit uses reserved mass(es) 198: released for this run
* Perforin (B-D48): 196 -> 175Lu
* Granzyme B (GB11): 198 -> 171Yb

### Peripheral blood basic II (suspension, cytof_xt) - kit 0.66 -> engine 0.00
* CD8a (RPA-T8): 146 -> 162Dy
* CD16 (3G8): 148 -> 165Ho
* CD45 (HI30): 154 -> 89Y
* CD14 (M5E2): 160 -> 151Eu
* CD3ε (UCHT1): 170 -> 141Pr

### T-cell phenotyping expansion (suspension, cytof_xt) - kit 0.54 -> engine 0.31
* CD195/CCR5 (NP-6G4): 144 -> 156Gd
* CD7 (CD7-6B7): 147 -> 145Nd
* CD183/CXCR3 (G025H7): 156 -> 163Dy
* CD194/CCR4 (L291H4): 158 -> 149Sm

### TBMNK + granulocytes (suspension, cytof_xt) - kit 0.50 -> engine 0.00
* CD8a (SK1): 142 -> 112Cd
* CD4 (SK3): 144 -> 174Yb
* CD19 (HIB19): 145 -> 142Nd
* CD14 (M5E2): 146 -> 160Gd
* CD56/NCAM (NCAM16.2): 149 -> 163Dy
* CD16 (3G8): 209 -> 165Ho

### Regulatory T cells (suspension, cytof_xt) - kit 0.46 -> engine 0.15
* CD49D (9F10): 141 -> 174Yb
* CD194/CCR4 (L291H4): 149 -> 175Lu
* CD45RA (HI100): 153 -> 155Gd
* CD3ε (UCHT1): 154 -> 141Pr
* CD95/Fas (DX2): 164 -> 152Sm
* CD45RO (UCHL1): 165 -> 149Sm
* HLA-DR (L243): 174 -> 143Nd
* CD127/IL7Rα (A019D5): 176 -> 165Ho

### Immune checkpoint core (suspension, cytof_xt) - kit 0.45 -> engine 0.00
* CD366/TIM-3 (F38-2E2): 154 -> 153Eu
* CD279/PD-1 (EH12.2H7): 156 -> 155Gd
* CD152/CTLA-4 (14D3): 162 -> 161Dy
* CD137/4-1BB (4B4-1): 173 -> 209Bi
* CD274/PD-L1 (MIH1): 174 -> 169Tm

### Cytokine expansion (suspension, cytof_xt) - kit 0.42 -> engine 0.00
* IL-5 (TRFK5): 147 -> 143Nd
* IL-10 (JES3-9D7): 148 -> 165Ho

### Lymphoid (imaging, hyperion_xti) - kit 0.41 -> engine 0.00
* CD8a (C8/144B): 162 -> 146Nd
* CD57 (NK/804): 163 -> 151Eu
* CD45RO (UCHL1): 173 -> 149Sm

### Tumour-infiltrating lymphocytes kit (imaging, hyperion_xti) - kit 0.34 -> engine 0.00
* Pan-Cytokeratin (C11): 148 -> 174Yb
* CD4 (EPR6855): 156 -> 163Dy
* CD20 (H1): 161 -> 115In
* CD8a (C8/144B): 162 -> 146Nd
* CD45RO (UCHL1): 173 -> 149Sm

### T-cell exhaustion (imaging, hyperion_xti) - kit 0.31 -> engine 0.27
* CD366/TIM-3 (D5D5R): 142 -> 154Sm

### Immune activation kit (imaging, hyperion_xti) - kit 0.25 -> engine 0.00
* Ki-67 (B56): 168 -> 172Yb

### Functional state (imaging, hyperion_xti) - kit 0.20 -> engine 0.00
* CD274/PD-L1 (73-10): 166 -> 174Yb
* Granzyme B (EPR20129-217): 176 -> 167Er

### Cytokine core (suspension, cytof_xt) - kit 0.18 -> engine 0.00
* kit uses reserved mass(es) 195: released for this run
* TNFα (Mab11): 114 -> 152Sm
* IFNγ (B27): 116 -> 165Ho
* IL-4 (MP4-25D2): 171 -> 142Nd
* IL-17A (BL168): 195 -> 161Dy

### Peripheral blood basic (suspension, cytof_xt) - kit 0.12 -> engine 0.00
* CD45 (HI30): 154 -> 89Y
* CD14 (M5E2): 160 -> 151Eu
* CD16 (3G8): 165 -> 145Nd
* CD8a (SK1): 168 -> 112Cd
* CD3ε (UCHT1): 170 -> 141Pr

### MDIPA expansion - T cell 2 (suspension, cytof_xt) - kit 0.12 -> engine 0.00
* CD278/ICOS (C398.4A): 169 -> 168Er
* CD184/CXCR4 (12G5): 175 -> 156Gd
* TIGIT (MBSA43): 209 -> 153Eu

### Myeloid / macrophages (imaging, hyperion_xti) - kit 0.09 -> engine 0.00
* CD163/M130 (EDHu-1): 147 -> 151Eu
* CD66b (BLR111H): 160 -> 166Er
* CD14 (EPR3653): 175 -> 163Dy

### T-cell IO expansion (suspension, cytof_xt) - kit 0.09 -> engine 0.00
* CD134/OX40 (ACT35): 150 -> 158Gd
* CD95/Fas (DX2): 152 -> 162Dy
* CD152/CTLA-4 (14D3): 161 -> 170Er
* CD279/PD-1 (EH12.2H7): 165 -> 155Gd
* CD278/ICOS (C398.4A): 168 -> 175Lu
* CD137/4-1BB (4B4-1): 173 -> 209Bi
* CD223/LAG-3 (11C3C65): 175 -> 150Nd

### Signalling I (suspension, cytof_xt) - kit 0.05 -> engine 0.05
* pStat5 [Y694] (47): 150 -> 147Sm
* pERK1/2 [T202/Y204] (D13.14.4E): 171 -> 167Er

### Stromal (imaging, hyperion_xti) - kit 0.03 -> engine 0.03
* α-Smooth Muscle Actin (1A4): 209 -> 141Pr

### MDIPA expansion - T cell 3 (suspension, cytof_xt) - kit 0.00 -> engine 0.00
* TIGIT (MBSA43): 159 -> 153Eu
* CD69 (FN50): 162 -> 113In
* CD279/PD-1 (EH12.2H7): 165 -> 155Gd
* CD366/TIM-3 (F38-2E2): 169 -> 159Tb
* CD278/ICOS (C398.4A): 175 -> 168Er
* CD137/4-1BB (4B4-1): 209 -> 173Yb

### Neuro expansion (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* TMEM119 (E3E4T): 171 -> 164Dy

### Glioblastoma (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* Vimentin (D21H3): 149 -> 143Nd

### Synuclein / tau mixed pathology (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* Tau (D1M9X): 149 -> 141Pr
* αSyn (E4U2F): 158 -> 149Sm
* pTau [S202/T205] (AT8): 172 -> 158Gd

### Proteinopathies (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* no changes

### Multiple sclerosis (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* no changes

### Alzheimer's disease (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* pTau [S202/T205] (AT8): 172 -> 158Gd

### Parkinson's disease (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* p-αSyn [S129] (EP1536Y): 169 -> 149Sm
* Tyrosine Hydroxylase (E2L6M): 172 -> 169Tm

### Basic immune (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* CD45 (D9M8I): 152 -> 145Nd
* CD68 (KP1): 159 -> 141Pr

### Tissue architecture (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* CD31/PECAM-1 (EPR3094): 151 -> 144Nd
* Fibronectin (EPR23110-46): 171 -> 151Eu

### Epithelial / mesenchymal (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* Vimentin (D21H3): 149 -> 143Nd
* β-Catenin (5H10): 169 -> 147Sm
* CD326/EpCAM (EPR20532-222): 172 -> 141Pr

### Tissue architecture kit (5) (imaging, hyperion_xti) - kit 0.00 -> engine 0.00
* Collagen Type I (Polyclonal): 169 -> 89Y
* Histone H3 (D1H2): 176 -> 171Yb

### Immune checkpoint expansion 1 (suspension, cytof_xt) - kit 0.00 -> engine 0.00
* CD223/LAG-3 (11C3C65): 172 -> 150Nd
* CD272/BTLA (MIH26): 175 -> 163Dy

### Cell cycle (suspension, cytof_xt) - kit 0.00 -> engine 0.00
* Ki-67 (B56): 162 -> 161Dy
