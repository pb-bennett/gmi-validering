export const isTestModeActivation = (searchParams) =>
  searchParams?.getAll('testmodus').length === 1 &&
  searchParams.get('testmodus') === '1';

export const isTestModeActivatedFromLocation = (
  location = typeof window !== 'undefined' ? window.location : null,
) => {
  try {
    return isTestModeActivation(
      new URLSearchParams(
        typeof location?.search === 'string' ? location.search : '',
      ),
    );
  } catch {
    return false;
  }
};
