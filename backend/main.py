from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
from pathlib import Path

app = FastAPI(title="Stanford NIL Valuation Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_DIR = Path(__file__).parent / "models"

qb_model = joblib.load(MODEL_DIR / "qb_model.pkl")
qb_scaler = joblib.load(MODEL_DIR / "qb_scaler.pkl")
wr_model = joblib.load(MODEL_DIR / "wr_model.pkl")
wr_scaler = joblib.load(MODEL_DIR / "wr_scaler.pkl")


class QBStats(BaseModel):
    completion_percent: float
    ypa: float
    avg_depth_of_target: float
    avg_time_to_throw: float
    btt_rate: float
    twp_rate: float
    grades_pass: float
    drop_rate: float
    pressure_to_sack_rate: float
    nil_budget: float = 10_000_000


class WRStats(BaseModel):
    yprr: float
    caught_percent: float
    yards_per_reception: float
    yards_after_catch_per_reception: float
    avg_depth_of_target: float
    route_rate: float
    drop_rate: float
    contested_catch_rate: float
    targeted_qb_rating: float
    grades_pass_route: float
    nil_budget: float = 10_000_000


def qb_tier(cap_pct: float) -> str:
    if cap_pct >= 10:
        return "Tier 1 — Elite Starter"
    if cap_pct >= 6:
        return "Tier 2 — Quality Starter"
    if cap_pct >= 3:
        return "Tier 3 — Serviceable Starter"
    return "Tier 4 — Backup / Depth"


def wr_tier(cap_pct: float) -> str:
    if cap_pct >= 5:
        return "Tier 1 — WR1"
    if cap_pct >= 3:
        return "Tier 2 — WR2"
    if cap_pct >= 1.5:
        return "Tier 3 — WR3 / Rotational"
    return "Tier 4 — Depth"


def predict(features: list[float], scaler, model, tier_fn, nil_budget: float):
    X = np.array(features).reshape(1, -1)
    X_scaled = scaler.transform(X)
    log_pred = model.predict(X_scaled)[0]
    cap_percent = float(np.expm1(log_pred))
    cap_percent = max(cap_percent, 0.0)
    recommended_nil = cap_percent / 100.0 * nil_budget
    return {
        "cap_percent": round(cap_percent, 4),
        "recommended_nil": round(recommended_nil, 2),
        "nil_budget": nil_budget,
        "percentile_tier": tier_fn(cap_percent),
    }


@app.post("/predict/qb")
def predict_qb(stats: QBStats):
    features = [
        stats.completion_percent,
        stats.ypa,
        stats.avg_depth_of_target,
        stats.avg_time_to_throw,
        stats.btt_rate,
        stats.twp_rate,
        stats.grades_pass,
        stats.drop_rate,
        stats.pressure_to_sack_rate,
    ]
    return predict(features, qb_scaler, qb_model, qb_tier, stats.nil_budget)


@app.post("/predict/wr")
def predict_wr(stats: WRStats):
    features = [
        stats.yprr,
        stats.caught_percent,
        stats.yards_per_reception,
        stats.yards_after_catch_per_reception,
        stats.avg_depth_of_target,
        stats.route_rate,
        stats.drop_rate,
        stats.contested_catch_rate,
        stats.targeted_qb_rating,
        stats.grades_pass_route,
    ]
    return predict(features, wr_scaler, wr_model, wr_tier, stats.nil_budget)


@app.get("/health")
def health():
    return {"status": "ok"}
