import { createTheme } from '@mui/material/styles'

// Only used where MUI has no equivalent token (chart colors, semantic status palette)
export const COLORS = {
  accent:  '#4f8ef7',
  accent2: '#7ed4a0',
  warn:    '#f0a060',
  danger:  '#e86060',
} as const

export const theme = createTheme({
  palette: {
    mode:    'dark',
    primary: { main: COLORS.accent },
    success: { main: COLORS.accent2 },
    warning: { main: COLORS.warn },
    error:   { main: COLORS.danger },
  },
})
