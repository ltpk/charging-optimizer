import { createTheme } from '@mui/material/styles'

// design tokens (redesign v2) — oklch tones from the handoff converted to hex, since Chart.js
// and MUI's alpha() need concrete colors
export interface EvTokens {
  bg: string
  panel: string
  panel2: string
  line: string
  grid: string
  text: string
  muted: string
  micro: string
  nightBg: string
  go: string
  wait: string
  warn: string
  solar: string
  onTone: string
  shadow: string
}

declare module '@mui/material/styles' {
  interface Palette {
    ev: EvTokens
  }
  interface PaletteOptions {
    ev?: EvTokens
  }
}

const TOKENS: Record<'light' | 'dark', EvTokens> = {
  dark: {
    bg: '#0f1013',
    panel: '#17191e',
    panel2: '#131519',
    line: 'rgba(255,255,255,0.08)',
    grid: 'rgba(255,255,255,0.05)',
    text: 'rgba(255,255,255,0.93)',
    muted: 'rgba(255,255,255,0.62)',
    micro: 'rgba(255,255,255,0.45)',
    nightBg: 'rgba(255,255,255,0.035)',
    go: '#61cb7c',
    wait: '#72b8f2',
    warn: '#fba952',
    solar: '#eed059',
    onTone: '#0f1013',
    shadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  light: {
    bg: '#f4f3ef',
    panel: '#ffffff',
    panel2: '#faf9f6',
    line: 'rgba(20,22,28,0.10)',
    grid: 'rgba(20,22,28,0.06)',
    text: '#16181d',
    muted: 'rgba(22,24,29,0.66)',
    micro: 'rgba(22,24,29,0.52)',
    nightBg: 'rgba(20,22,28,0.035)',
    go: '#1d7d3e',
    wait: '#1666aa',
    warn: '#bb5d00',
    solar: '#be8700',
    onTone: '#ffffff',
    shadow: '0 12px 32px rgba(20,22,28,0.14)',
  },
}

export const MONO = "'JetBrains Mono', ui-monospace, monospace"

// overline label used everywhere (10.5/600, +1.2 px tracking, uppercase)
export const overline = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
  color: 'ev.micro',
  lineHeight: 1.4,
} as const

export function buildTheme(mode: 'light' | 'dark') {
  const t = TOKENS[mode]
  return createTheme({
    // sm = desktop layout (≥ 760 px), md = hero side by side (≥ 1040 px)
    breakpoints: { values: { xs: 0, sm: 760, md: 1040, lg: 1200, xl: 1536 } },
    palette: {
      mode,
      ev: t,
      background: { default: t.bg, paper: t.panel },
      text: { primary: t.text, secondary: t.muted, disabled: t.micro },
      divider: t.line,
      // ink is the accent: focus rings, slider, selected states
      primary: { main: mode === 'dark' ? '#ededee' : t.text, contrastText: t.panel },
      success: { main: t.go, contrastText: t.onTone },
      info: { main: t.wait, contrastText: t.onTone },
      warning: { main: t.warn, contrastText: t.onTone },
    },
    typography: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14 },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { fontSize: 14 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      // segmented control
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            background: t.panel2,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            padding: 2,
            gap: 2,
            '& .MuiToggleButtonGroup-grouped, & .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
              border: 0,
              borderRadius: 6,
              margin: 0,
            },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.2,
            color: t.muted,
            padding: '6px 11px',
            minHeight: 30,
            whiteSpace: 'nowrap',
            '&.Mui-selected, &.Mui-selected:hover': { background: t.text, color: t.panel },
          },
        },
      },
      // 30×18 track, 12 px knob
      MuiSwitch: {
        styleOverrides: {
          root: { width: 30, height: 18, padding: 0, overflow: 'visible' },
          switchBase: {
            padding: 3,
            color: t.muted,
            '&.Mui-checked': {
              transform: 'translateX(12px)',
              color: t.panel,
              '& + .MuiSwitch-track': { opacity: 1, backgroundColor: t.go },
            },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.4 },
          },
          thumb: { width: 12, height: 12, boxShadow: 'none' },
          track: { borderRadius: 9, opacity: 1, backgroundColor: t.line, transition: 'background-color 150ms' },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: { root: { marginLeft: 0, marginRight: 0, gap: 9 }, label: { fontSize: 13 } },
      },
      MuiSlider: {
        styleOverrides: {
          root: { color: t.text, height: 4, padding: '10px 0' },
          rail: { backgroundColor: t.line, opacity: 1 },
          track: { border: 'none' },
          thumb: {
            width: 18,
            height: 18,
            backgroundColor: t.panel,
            border: `2px solid ${t.text}`,
            '&::before': { boxShadow: 'none' },
          },
          mark: { backgroundColor: t.micro },
          markLabel: { fontSize: 11, color: t.micro, fontFamily: MONO },
        },
      },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: 12 } } },
    },
  })
}
