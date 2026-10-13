# Client Churn Prediction & Retention Strategy Optimization

**Highspring - Content Strategy & Client Advisory (Gurugram)** - churn prediction, driver explanation and retention playbook for external clients (advertisers, publishers, website owners), built on the IBM Telco churn dataset re-framed as B2B client data.

- Run date (UTC): **2026-09-23T18:00:47Z** | seed: **42** everywhere | clients: **7,043** | deployed model: **XGBoost (group-noise-pruned)** | features used: **22**

## 1. Project overview

The pipeline: load and clean the Telco base data, re-frame telecom columns into client-advisory vocabulary, generate synthetic behavioural features, benchmark and tune four model families, prune noise-level feature groups, choose an operating threshold, explain predictions with SHAP, and map every client to a retention segment with an expected-loss-weighted action queue.

Headline result: the deployed model reaches **test ROC-AUC 0.9147** and **PR-AUC 0.7857** at threshold **0.6094**.

## 2. Data

- Base: IBM Telco customer churn dataset (7,043 rows) re-framed as a Highspring client roster (`Client_Tenure_Months`, `Engagement_Type`, `Monthly_Client_Value`, ...). Split: stratified **70 / 15 / 15** train/validation/test = 4,929 / 1,057 / 1,057 (seed 42). The test set is touched only for final reporting (plus one sanctioned pruning before/after report).

> **SYNTHETIC DATA - READ CAREFULLY.** The 16 behavioural features (engagement, compliance, support, content quality) are **100% simulated**. Each feature is generated from a latent *Client_Health_Index* (itself built only from tenure, engagement/contract type and support access) **plus a class-conditional shift tied to the churn outcome** (Cohen's d = 0.35-0.70 per feature) with heavy within-class noise - the two classes intentionally overlap. Consequences: (1) the metrics below prove the **pipeline works end-to-end**, they are **NOT real Highspring performance**; (2) because features are simulated conditional on the outcome with overlap, **importance rankings reflect simulation assumptions, NOT real Highspring drivers**; (3) real deployments must generate these features from actual CRM/ops systems and revalidate everything.

**Sanity gates (all printed and enforced in the notebook):** full-feature XGBoost test ROC-AUC **0.8937** (target band 0.86-0.90) vs base-columns-only **0.8232** - delta **+0.0705** (required >= +0.02). Anything above 0.92 would force a regeneration with more noise. Passed on attempt **1** (noise multiplier 1.0). Realism: ~4% missing values in two columns, injected outliers, and two pure-noise control features (`noise_control_1/2`).

Correlation of each behavioural feature with the latent health index (target |r| ~ 0.3-0.6):

| Feature | corr. with Client_Health_Index |
|---|---|
| Days_Since_Last_Engagement | -0.43 |
| Content_Quality_Score | +0.42 |
| Engagement_Score | +0.42 |
| Guideline_Compliance_Score | +0.40 |
| Monthly_Engagements | +0.40 |
| Compliance_Flags | -0.39 |
| Response_Rate | +0.39 |
| Search_Visibility_Change | +0.39 |
| Content_Score_Trend_30D | +0.38 |
| Support_Tickets | -0.38 |
| Unresolved_Support_Tickets | -0.38 |
| Traffic_Change | +0.38 |
| Avg_Resolution_Time | -0.37 |
| Critical_Compliance_Issues | -0.35 |
| Client_Meetings | +0.35 |
| Report_Views | +0.34 |

## 3. Method

1. **Leakage control** - `Churn Score`, `Churn Reason`, `Churn_Status`, `CLTV`, post-churn columns, `Client_ID`, the health index and high-cardinality `Client_Location` (1,129 cities) never enter the feature matrix; `Region` (constant) is dropped too.
2. **Preprocessing inside the pipeline** - median imputation + scaling for numeric columns, most-frequent imputation + one-hot encoding (ignore-unknown, drop-first) for categorical columns, all refit inside every CV fold.
3. **Models & tuning** - Logistic Regression (class-weighted), Random Forest, XGBoost (scale_pos_weight) and a Logistic Regression + SMOTE variant (imblearn pipeline; SMOTE applied only inside training folds). `RandomizedSearchCV`, 5-fold stratified, scoring ROC-AUC, on the **training set only**; 20 candidates per model.
4. **Thresholds on validation** - F1-optimal operating point plus a cost-based point (missed churner = 5x a wasted outreach).
5. **Noise-floor pruning (grouped)** - grouped permutation importance (20 repeats) and drop-group importance on **validation** for correlated feature blocks (content_quality, compliance, engagement, support); the noise floor is the max importance of the two pure-noise controls; only **whole groups** at/below the floor are dropped; the reduced model is kept only if validation ROC-AUC does not drop more than 0.005.
6. **Evaluation** - one test pass for the comparison table; SHAP explanations; out-of-fold scoring (`cross_val_predict`, 5-fold stratified) for roster segmentation; shuffled-label reality check; capacity and ROI analyses.

## 4. Model comparison (test set, F1-optimal thresholds from validation)

| Model | ROC-AUC | PR-AUC | CV AUC (5-fold train) | Accuracy | Precision | Recall | F1 | Threshold |
|---|---|---|---|---|---|---|---|---|
| Logistic Regression | 0.9104 | 0.7662 | 0.9075 +/- 0.0106 | 0.842 | 0.663 | 0.821 | 0.734 | 0.614 |
| Random Forest | 0.9086 | 0.7610 | 0.9034 +/- 0.0104 | 0.836 | 0.655 | 0.807 | 0.723 | 0.458 |
| XGBoost **(deployed before pruning)** | 0.9131 | 0.7834 | 0.9072 +/- 0.0083 | 0.836 | 0.640 | 0.871 | 0.738 | 0.511 |
| Logistic Regression + SMOTE | 0.9116 | 0.7703 | 0.9072 +/- 0.0105 | 0.851 | 0.687 | 0.800 | 0.739 | 0.643 |

Reality checks: shuffled-label AUC **0.5014 +/- 0.0148** (expected ~0.5); max observed metric across all evaluations **0.9147** (warning would fire above 0.95 - it did not).

## 5. Final deployed model - test results

**XGBoost (group-noise-pruned)** - validation ROC-AUC 0.8913 (pre-pruning: 0.8880). Hyperparameters: `{"max_depth": 2, "min_child_weight": 10, "reg_lambda": 10.0}`, n_estimators=408 (selected with early stopping on validation, then refit as a plain pipeline).

| Feature count | Validation AUC | Test ROC-AUC | Test PR-AUC |
|---|---|---|---|
| before pruning: 24 | 0.8880 | 0.9131 | 0.7834 |
| after pruning: 22 | 0.8913 | 0.9147 | 0.7857 |

Grouped importance on validation: noise floor (max control) = **0.00012**. Groups surviving the floor: **content_quality, compliance, engagement, support**; dropped: **none**. The two `noise_control_*` columns were always removed. The reduced model was kept because validation ROC-AUC improved (within the 0.005 tolerance rule).

**Test at the F1-optimal threshold 0.6094** (validation-chosen):

- Accuracy 0.8477 | Precision 0.6798 | Recall 0.8036 | F1 0.7365 | ROC-AUC 0.9147 | PR-AUC 0.7857
- Confusion matrix: **671 TN / 106 FP / 55 FN / 225 TP**

**Cost-based threshold 0.2600** (missed churner = 5x cost):

- Recall rises to 0.9607 at precision 0.4991 - confusion matrix: 507 TN / 270 FP / 11 FN / 269 TP.

Final feature list (deployed model):

`Client_Tenure_Months`, `Service_Type`, `Support_Access`, `Engagement_Type`, `Monthly_Client_Value`, `Cumulative_Client_Value`, `Content_Quality_Score`, `Content_Score_Trend_30D`, `Guideline_Compliance_Score`, `Compliance_Flags`, `Critical_Compliance_Issues`, `Engagement_Score`, `Monthly_Engagements`, `Client_Meetings`, `Report_Views`, `Response_Rate`, `Support_Tickets`, `Unresolved_Support_Tickets`, `Avg_Resolution_Time`, `Days_Since_Last_Engagement`, `Search_Visibility_Change`, `Traffic_Change`

## 6. Top churn drivers (SHAP, plain English)

| Rank | Driver | Mean |SHAP| | Plain-English meaning | Direction |
|---|---|---|---|
| 1 | `Service_Type_Fiber optic` | 0.4295 | Service Type = 'Fiber optic' | higher value -> higher churn risk |
| 2 | `Client_Tenure_Months` | 0.4158 | how long the client has stayed with us | higher value -> lower churn risk |
| 3 | `Engagement_Type_Two year` | 0.3989 | Engagement Type = 'Two year' | higher value -> lower churn risk |
| 4 | `Days_Since_Last_Engagement` | 0.3379 | days since the client last engaged with us | higher value -> higher churn risk |
| 5 | `Engagement_Score` | 0.2612 | overall engagement with our advisory service | higher value -> lower churn risk |
| 6 | `Response_Rate` | 0.2377 | how quickly the client responds to outreach | higher value -> lower churn risk |
| 7 | `Critical_Compliance_Issues` | 0.2351 | count of critical compliance issues | higher value -> higher churn risk |
| 8 | `Monthly_Client_Value` | 0.2315 | the client's monthly spend | higher value -> higher churn risk |
| 9 | `Report_Views` | 0.2243 | how often the client opens performance reports | higher value -> lower churn risk |
| 10 | `Search_Visibility_Change` | 0.2113 | 30-day change in the client's search visibility | higher value -> lower churn risk |

The two pure-noise controls are **not in the deployed model** (removed by noise-floor pruning, as intended), so no noise feature can appear in this ranking.

**Sensitivity check:** sweeping `Engagement_Score`, `Compliance_Flags`, `Days_Since_Last_Engagement` across their ranges for a fixed client moves the predicted probability in the expected direction (all monotonic: true, worst wrong-way step 0.0000). net-direction test with per-step tolerance; boosted trees are piecewise-constant.

## 7. Segmentation & retention playbook

All 7,043 clients are scored with **out-of-fold** probabilities (`cross_val_predict`, 5-fold stratified; OOF ROC-AUC diagnostic 0.9068; official performance = section 5). Risk band: churn_probability >= 0.6094. Value: `Monthly_Client_Value x clip(72 - Client_Tenure_Months, 0, 24)`; high value if above the roster median ($1,196). **Revenue at risk = probability-weighted expected loss** (sum of churn_probability x value per segment).

| Segment | Clients | Share | Expected loss (pw) | Playbook |
|---|---|---|---|---|
| **High risk + High value** | 1,647 | 23.4% | $2,729,353 | Save now - senior advisor call + content strategy review within 7 days |
| **High risk + Low value** | 424 | 6.0% | $270,231 | Automated nudge - email/portal tips + self-serve content check |
| **Low risk + High value** | 1,879 | 26.7% | $906,244 | Nurture - quarterly business review + upsell content roadmap |
| **Low risk + Low value** | 3,093 | 43.9% | $238,092 | Monitor - automated health score, standard support |
| **Total** | **7,043** | **100%** | **$4,143,920** | |

**Capacity queue:** the top 50 clients by `churn_probability x value` (saved to `reports/save_now_list.csv`) cover $120,641 of expected loss (2.9% of the total). Capacity curve (N = 10-1,000): 25% of total expected loss is covered at **N = 496**; 50% and 75% are not reached within the evaluated range. Curve shape depends on the value distribution; synthetic values are flat, so the shape will differ with real client contract values.

**ROI scenarios (illustrative only)** - top-50 queue, expected loss $120,641, cost $100 per intervention:

| Save rate | Expected loss avoided | Cost | Net benefit | ROI |
|---|---|---|---|---|
| 10% | $12,064 | $5,000 | $7,064 | 1.41 |
| 20% | $24,128 | $5,000 | $19,128 | 3.83 |
| 30% | $36,192 | $5,000 | $31,192 | 6.24 |

> Illustrative only: value comes from telecom bills and save rates are assumptions; churn risk is not responsiveness to intervention - a pilot with a control group is needed to measure real uplift.

## 8. Limitations

1. **Synthetic behavioural features, simulated conditional on the outcome with overlap** - metrics validate the pipeline, not reality; importance rankings reflect the generator's assumptions, not real Highspring drivers.
2. **Moderate PR-AUC (0.7857)** - with a ~27% churn base rate, roughly 1 in 3 high-risk flags is a false alarm at the F1 threshold; the cost threshold trades more false alarms for fewer misses.
3. **Churn risk is not responsiveness to intervention** - the ROI table is an assumption exercise; a pilot **with a control group** is required to measure real uplift before any playbook rollout.
4. **Flat value distribution** - in the synthetic data value comes from telecom bills, so the capacity curve's shape and the Save-now queue's concentration will differ with real client contract values.
5. **Noise controls behave as designed** - both controls sit at the noise floor and are excluded; if real-world features ever score near this floor they should be treated as uninformative.

## 9. Generalisation

The base data covers **one region (California) and one industry (telecom)**; the behavioural layer is simulated. Before any real use, the model must be **retrained and validated on real Highspring client data per region and per client segment**, the business features must come from real CRM/ops systems (not simulations), and the deployment must be **monitored for drift** (input distribution, prediction distribution, and realised churn), with thresholds re-chosen per market and re-tuned as the cost model changes.

## 10. How to run & use the model

```bash
pip install -r requirements.txt   # exact versions used by the last run
jupyter execute "Client churn prediction & Retention Strategy Optimization.ipynb"
```

Artifacts from the last run: `models/churn_model.joblib` (full fitted pipeline incl. preprocessing), `models/model_metadata.json` (schema, thresholds, business rules, versions, seed, split sizes), `reports/metrics.json` (all metrics), `reports/figures/*.png`, `reports/segments.csv`, `reports/save_now_list.csv`, `data/processed/client_dataset_synthetic.csv`.

Score a single client with the saved API helper:

```python
from predict_utils import score_client

client = {"Client_Tenure_Months": 3, "Engagement_Type": "Month-to-month",
          "Service_Type": "Fiber optic", "Support_Access": "No",
          "Monthly_Client_Value": 95.0, "Cumulative_Client_Value": 285.0,
          "Engagement_Score": 35.0, "Compliance_Flags": 4,
          "Days_Since_Last_Engagement": 55}
result = score_client(client)
# -> churn_probability, risk_band, segment, recommended_action, top_reasons (SHAP, plain English)
```

Or load the pipeline directly:

```python
import json, joblib, pandas as pd
model = joblib.load("models/churn_model.joblib")
meta = json.load(open("models/model_metadata.json"))
proba = float(model.predict_proba(pd.DataFrame([client]))[0, 1])
band = "High risk" if proba >= meta["thresholds"]["f1_optimal"] else "Low risk"
```

The notebook's final cell re-loads the saved model and asserts `np.allclose` against the in-run pipeline on 5 sample clients - persistence is verified on every run.

---

*Generated from `reports/metrics.json` + `models/model_metadata.json`; every number above is produced by the executed notebook run, not hand-written.*
