// App is locked to light mode app-wide. Always report "light" so any
// caller using this hook (or the React Navigation default theme) does
// not fall through to the OS dark setting.
export function useColorScheme() {
  return "light" as const;
}
