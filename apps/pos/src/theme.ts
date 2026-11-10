/** Field-use sizes from the design guide: big targets, big text, and amber (never red) for offline. */
export const theme = {
  colors: {
    bg: '#FFFBF5',
    text: '#2B1B12',
    muted: '#6B5646',
    primary: '#8A3B12',
    onPrimary: '#FFFFFF',
    border: '#C9B8A8',
    error: '#B3261E',
    amberBg: '#FFE9B8',
    amberText: '#5C3D00',
    disabled: '#D9CFC5',
  },
  minTarget: 64,
  minText: 18,
} as const;
