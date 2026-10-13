#!/usr/bin/env bash
# Start backend, exercise every endpoint, print results, stop backend.
set -u
cd "$(dirname "$0")/../backend"

python -m uvicorn app.main:app --port 8000 > /tmp/churn_backend.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 30); do
  curl -s --max-time 2 localhost:8000/api/health >/dev/null 2>&1 && break
  sleep 1
done

BASE=http://localhost:8000
say() { echo; echo "== $1 =="; }

say health
curl -s $BASE/api/health; echo

say "model-info (trimmed)"
curl -s $BASE/api/model-info | python -c "import json,sys; d=json.load(sys.stdin); print(json.dumps({'model_version':d['model_version'],'synthetic_data':d['synthetic_data'],'quick_check_fields':d['quick_check_fields'],'test_metrics':{k:d['test_metrics'][k] for k in ('roc_auc','accuracy','precision','recall','f1')},'disclaimer':d['disclaimer']}, indent=1))"

say glossary
curl -s $BASE/api/glossary | python -c "import json,sys; d=json.load(sys.stdin); print('fields:',len(d['fields']),'| segments:',len(d['segments']),'| bands:',len(d['risk_bands']),'| modes:',len(d['modes']),'| metrics:',len(d['metrics']),'| misc:',len(d['misc']))"

say "predict save=false (default; must NOT write to db)"
curl -s "$BASE/api/predict" -H 'Content-Type: application/json' -d '{
  "Client_Tenure_Months": 3, "Service_Type": "Fiber optic", "Support_Access": "No",
  "Engagement_Type": "Month-to-month", "Monthly_Client_Value": 95.0,
  "Cumulative_Client_Value": 285.0, "Engagement_Score": 35.0,
  "Compliance_Flags": 4, "Days_Since_Last_Engagement": 55}' | python -m json.tool

say "predict mode=catch_more (blank fields allowed -> typical values)"
curl -s "$BASE/api/predict" -H 'Content-Type: application/json' \
  -d '{"Service_Type": "DSL", "Engagement_Type": "One year", "mode": "catch_more"}' \
  | python -c "import json,sys; d=json.load(sys.stdin); print({k:d[k] for k in ('risk_score','risk_band','segment','mode_used','model_version')})"

say plain-English validation error
curl -s "$BASE/api/predict" -H 'Content-Type: application/json' \
  -d '{"Days_Since_Last_Engagement": 150}'; echo
curl -s "$BASE/api/predict" -H 'Content-Type: application/json' \
  -d '{"Service_Type": "Copper"}'; echo

say "batch (1 valid, 2 invalid)"
printf 'Client_ID,Months with us,Plan,Contract length,Monthly payment\nA-001,10,Premium (Fiber),Month to month,80\nA-002,5,Copper,Month to month,80\nA-003,-900,Standard (DSL),One year,50\n' > /tmp/batch_test.csv
curl -s "$BASE/api/predict/batch" -F "file=@/tmp/batch_test.csv" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('count:',d['count'],'rejected:',d['rejected_count']); [print(' row',r['row'],'->',r['reason']) for r in d['rejected']]"

say "batch template (first 2 lines)"
curl -s "$BASE/api/predict/batch/template" | head -2

say "what-if (recent contact should LOWER the score)"
curl -s "$BASE/api/what-if" -H 'Content-Type: application/json' -d '{
  "client": {"Client_Tenure_Months": 12, "Service_Type": "Fiber optic",
             "Engagement_Type": "Month-to-month", "Engagement_Score": 40,
             "Days_Since_Last_Engagement": 45},
  "changes": {"Days_Since_Last_Engagement": 5}}' \
  | python -c "import json,sys; d=json.load(sys.stdin); print('before',d['before']['risk_score'],'-> after',d['after']['risk_score'],'delta',d['delta']); print('note:',d['note'])"

say "save=true then history"
curl -s "$BASE/api/predict?save=true" -H 'Content-Type: application/json' \
  -d '{"Client_ID": "CURL-001", "Service_Type": "Fiber optic", "Engagement_Type": "Month-to-month"}' >/dev/null
curl -s "$BASE/api/predictions?limit=5" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('history rows:',d['count']); [print(' ',i['created_at'],i['source'],i['client_id'],i['risk_band'],i['risk_score']) for i in d['items'][:3]]"

say segments
curl -s "$BASE/api/segments" | python -c "import json,sys; d=json.load(sys.stdin); [print(' ',s['segment'],'| clients:',s['clients'],'| loss:',s['expected_loss']) for s in d['segments']]"

say "save-now (top 3)"
curl -s "$BASE/api/save-now?limit=3" | python -m json.tool | head -18

say "capacity curve (first points)"
curl -s "$BASE/api/capacity-curve" | python -c "import json,sys; d=json.load(sys.stdin); print(d['points'][:5]); print(d['caption'])"

say "figures (whitelisted + rejected)"
curl -s -o /dev/null -w "roc_curves.png -> %{http_code}\n" "$BASE/api/figures/roc_curves.png"
curl -s -o /dev/null -w "../secrets -> %{http_code}\n" "$BASE/api/figures/..%2F..%2Fsecrets"
curl -s -o /dev/null -w "not-a-figure -> %{http_code}\n" "$BASE/api/figures/not-a-figure.png"

echo; echo "== done, stopping server =="
