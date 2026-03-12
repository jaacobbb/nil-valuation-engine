import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ComposedChart,
  XAxis,
  YAxis,
  ReferenceLine,
  Scatter,
  ResponsiveContainer,
  Cell,
  ReferenceArea,
} from 'recharts'

const QB_FIELDS = [
  { key: 'completion_percent', label: 'Completion %', range: [52, 64, 72], desc: '% of passes completed' },
  { key: 'ypa', label: 'Yards Per Attempt', range: [5.5, 7.2, 9.0], desc: 'Average yards gained per attempt' },
  { key: 'avg_depth_of_target', label: 'Avg Depth of Target', range: [6.0, 8.5, 11.0], desc: 'Average air yards per target' },
  { key: 'avg_time_to_throw', label: 'Avg Time to Throw', range: [2.2, 2.6, 3.2], desc: 'Seconds from snap to release' },
  { key: 'btt_rate', label: 'Big Time Throw Rate', range: [0.02, 0.05, 0.10], desc: '% of throws graded as elite' },
  { key: 'twp_rate', label: 'Turnover Worthy Rate', range: [0.01, 0.03, 0.06], desc: '% of plays risking turnover (lower = better)' },
  { key: 'grades_pass', label: 'PFF Pass Grade', range: [40, 65, 85], desc: 'PFF passing grade (0-100)' },
  { key: 'drop_rate', label: 'Drop Rate', range: [0.02, 0.05, 0.09], desc: '% of catchable passes dropped by receivers' },
  { key: 'pressure_to_sack_rate', label: 'Pressure to Sack Rate', range: [0.15, 0.30, 0.50], desc: '% of pressures that become sacks (lower = better)' },
]

const WR_FIELDS = [
  { key: 'yprr', label: 'YPRR', range: [0.8, 1.4, 2.2], desc: 'Yards per route run' },
  { key: 'caught_percent', label: 'Catch Rate', range: [50, 65, 78], desc: '% of targets caught' },
  { key: 'yards_per_reception', label: 'Yards Per Reception', range: [8, 12, 17], desc: 'Average yards per catch' },
  { key: 'yards_after_catch_per_reception', label: 'YAC Per Reception', range: [3, 5, 8], desc: 'Yards after catch per reception' },
  { key: 'avg_depth_of_target', label: 'Avg Depth of Target', range: [5, 9, 14], desc: 'Average air yards per target' },
  { key: 'route_rate', label: 'Route Rate', range: [85, 93, 98], desc: '% of pass plays where WR runs a route' },
  { key: 'drop_rate', label: 'Drop Rate', range: [2, 7, 14], desc: '% of catchable targets dropped (lower = better)' },
  { key: 'contested_catch_rate', label: 'Contested Catch Rate', range: [25, 45, 65], desc: '% of contested targets caught' },
  { key: 'targeted_qb_rating', label: 'Targeted QB Rating', range: [70, 95, 120], desc: 'QB passer rating when targeting this WR' },
  { key: 'grades_pass_route', label: 'PFF Route Grade', range: [40, 65, 88], desc: 'PFF route running grade (0-100)' },
]

const QB_TIERS = [
  { threshold: 10, label: 'Tier 1 — Elite Starter' },
  { threshold: 6, label: 'Tier 2 — Quality Starter' },
  { threshold: 3, label: 'Tier 3 — Serviceable Starter' },
  { threshold: 0, label: 'Tier 4 — Backup / Depth' },
]

const WR_TIERS = [
  { threshold: 5, label: 'Tier 1 — WR1' },
  { threshold: 3, label: 'Tier 2 — WR2' },
  { threshold: 1.5, label: 'Tier 3 — WR3 / Rotational' },
  { threshold: 0, label: 'Tier 4 — Depth' },
]

function formatCurrency(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function HelmetIcon({ active }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 4C10 4 5 9 5 15C5 19 7 22 7 22H12L14 18H20L22 22H25C25 22 27 19 27 15C27 9 22 4 16 4Z"
        fill={active ? '#8C1515' : '#2a2a2a'}
        stroke={active ? '#f0f0f0' : '#444444'}
        strokeWidth="1.5"
      />
      <line x1="12" y1="12" x2="20" y2="12" stroke={active ? '#f0f0f0' : '#444444'} strokeWidth="1" />
      <circle cx="22" cy="14" r="2" fill={active ? '#f0f0f0' : '#444444'} opacity="0.5" />
    </svg>
  )
}

function RangeIndicator({ value, min, avg, elite }) {
  const totalRange = elite - min
  const padding = totalRange * 0.15
  const lo = min - padding
  const hi = elite + padding
  const fullRange = hi - lo

  const avgPct = ((avg - lo) / fullRange) * 100
  const elitePct = ((elite - lo) / fullRange) * 100

  let valPct = null
  if (value !== '' && !isNaN(parseFloat(value))) {
    const v = parseFloat(value)
    valPct = Math.max(0, Math.min(100, ((v - lo) / fullRange) * 100))
  }

  return (
    <div className="range-indicator">
      <div className="range-track">
        <div className="range-zone range-low" style={{ width: `${avgPct}%` }} />
        <div className="range-zone range-avg" style={{ left: `${avgPct}%`, width: `${elitePct - avgPct}%` }} />
        <div className="range-zone range-elite" style={{ left: `${elitePct}%`, width: `${100 - elitePct}%` }} />
        {valPct !== null && (
          <div className="range-marker" style={{ left: `${valPct}%` }} />
        )}
      </div>
      <div className="range-labels">
        <span>{min}</span>
        <span>{avg}</span>
        <span>{elite}</span>
      </div>
    </div>
  )
}

function PercentileBar({ capPercent, position }) {
  const tiers = position === 'qb' ? QB_TIERS : WR_TIERS
  const maxCap = position === 'qb' ? 15 : 8
  const thresholds = tiers.map(t => t.threshold).filter(t => t > 0)

  const dotX = Math.min(capPercent, maxCap)
  const data = [{ x: dotX, y: 0.5 }]

  return (
    <div className="percentile-chart">
      <ResponsiveContainer width="100%" height={70}>
        <ComposedChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <XAxis
            type="number"
            domain={[0, maxCap]}
            tickCount={6}
            tick={{ fill: '#888888', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
            axisLine={{ stroke: '#2a2a2a' }}
            tickLine={{ stroke: '#2a2a2a' }}
            label={{
              value: 'Cap % Equivalent',
              position: 'bottom',
              offset: 2,
              style: { fill: '#444444', fontSize: 9, fontFamily: 'IBM Plex Mono' },
            }}
          />
          <YAxis type="number" domain={[0, 1]} hide />
          {thresholds.map((t, i) => (
            <ReferenceLine key={i} x={t} stroke="#3a3a3a" strokeDasharray="3 3" />
          ))}
          <Scatter data={data} dataKey="y">
            <Cell fill="#8C1515" />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (target === null) { setValue(0); return }
    const start = performance.now()
    const from = 0
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + (target - from) * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return value
}

export default function App() {
  const [position, setPosition] = useState('qb')
  const [formData, setFormData] = useState({})
  const [result, setResult] = useState(null)
  const [nilBudget, setNilBudget] = useState(10_000_000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const fields = position === 'qb' ? QB_FIELDS : WR_FIELDS

  const handlePositionChange = (pos) => {
    setPosition(pos)
    setFormData({})
    setResult(null)
    setShowResults(false)
    setError(null)
  }

  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const recalcNil = useCallback((budget) => {
    if (result) {
      const newNil = result.cap_percent / 100 * budget
      setResult(prev => ({ ...prev, recommended_nil: newNil, nil_budget: budget }))
    }
  }, [result])

  const handleBudgetChange = (value) => {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''))
    if (!isNaN(num)) {
      setNilBudget(num)
      recalcNil(num)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    const payload = {}
    fields.forEach(f => {
      payload[f.key] = parseFloat(formData[f.key]) || 0
    })
    payload.nil_budget = nilBudget

    try {
      const res = await fetch(`/predict/${position}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Model unavailable')
      const data = await res.json()
      setResult(data)
      setShowResults(true)
    } catch {
      setError('MODEL UNAVAILABLE — check backend connection')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({})
    setResult(null)
    setShowResults(false)
    setError(null)
  }

  const animatedNil = useCountUp(
    result ? result.recommended_nil : null,
    800
  )

  const modelInfo = position === 'qb'
    ? { samples: 113, r2: 0.28 }
    : { samples: 133, r2: 0.28 }

  return (
    <div className="app">
      <header className="header">
        <div className={`header-content ${mounted ? 'fade-in' : ''}`}>
          <span className="header-school">STANFORD FOOTBALL</span>
          <h1 className="header-title">NIL VALUATION ENGINE</h1>
          <div className="header-line" />
          <span className="header-version">v1.0 — QB / WR</span>
        </div>
      </header>

      <main className="main-grid">
        <aside className={`panel panel-left ${mounted ? 'fade-in delay-0' : ''}`}>
          <div className="panel-header">POSITION</div>
          <div className="position-buttons">
            <button
              className={`pos-btn ${position === 'qb' ? 'active' : ''}`}
              onClick={() => handlePositionChange('qb')}
            >
              <HelmetIcon active={position === 'qb'} />
              <span>QB</span>
            </button>
            <button
              className={`pos-btn ${position === 'wr' ? 'active' : ''}`}
              onClick={() => handlePositionChange('wr')}
            >
              <HelmetIcon active={position === 'wr'} />
              <span>WR</span>
            </button>
          </div>
          <div className="model-info">
            {modelInfo.samples} training samples · R² {modelInfo.r2}
          </div>
        </aside>

        <section className={`panel panel-center ${mounted ? 'fade-in delay-1' : ''}`}>
          <div className="panel-header">{position.toUpperCase()} STATISTICS INPUT</div>
          <div className="form-scroll">
            {fields.map(field => (
              <div key={field.key} className="input-group" title={`${field.desc} — Elite: ${field.range[2]}`}>
                <label className="input-label">{field.label}</label>
                <input
                  type="number"
                  step="any"
                  className="stat-input"
                  value={formData[field.key] ?? ''}
                  onChange={e => handleInputChange(field.key, e.target.value)}
                  placeholder={field.range[1].toString()}
                />
                <RangeIndicator
                  value={formData[field.key] ?? ''}
                  min={field.range[0]}
                  avg={field.range[1]}
                  elite={field.range[2]}
                />
              </div>
            ))}
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button
            className="calculate-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <span className="loading-dots">
                PROCESSING<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
              </span>
            ) : (
              'CALCULATE NIL VALUE'
            )}
          </button>
        </section>

        <aside className={`panel panel-right ${showResults ? 'results-visible' : ''} ${mounted ? 'fade-in delay-2' : ''}`}>
          {showResults && result ? (
            <div className="results-content">
              <div className="tier-badge">{result.percentile_tier.toUpperCase()}</div>

              <div className="nil-value">
                {formatCurrency(animatedNil)}
              </div>
              <div className="nil-sublabel">Recommended Annual NIL Value</div>

              <div className="cap-percent">
                {result.cap_percent.toFixed(2)}% of salary cap equivalent
              </div>

              <div className="divider" />

              <div className="budget-section">
                <label className="input-label">TOTAL NIL BUDGET</label>
                <input
                  type="text"
                  className="stat-input budget-input"
                  value={`$${nilBudget.toLocaleString()}`}
                  onChange={e => handleBudgetChange(e.target.value)}
                />
              </div>

              <div className="divider" />

              <PercentileBar capPercent={result.cap_percent} position={position} />

              <div className="confidence-note">
                Model R² = {modelInfo.r2} · Predictions are directional estimates, not guarantees
              </div>

              <button className="reset-btn" onClick={handleReset}>
                RESET
              </button>
            </div>
          ) : (
            <div className="results-placeholder">
              <div className="placeholder-icon">&#9632;</div>
              <p>Enter player statistics and calculate to see NIL valuation</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
