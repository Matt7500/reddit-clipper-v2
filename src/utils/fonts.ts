export const loadCustomFont = async (name: string, url: string): Promise<void> => {
  try {
    const font = new FontFace(name, `url(${url})`);
    const loadedFont = await font.load();
    document.fonts.add(loadedFont);
  } catch (error) {
    console.error(`Error loading font ${name}:`, error);
  }
};

export const preloadProfileFonts = async (profiles: Array<{ font: string; font_url: string | null }>) => {
  const loadPromises = profiles
    .filter(profile => profile.font_url)
    .map(profile => loadCustomFont(profile.font, profile.font_url!));
  
  await Promise.all(loadPromises);
}; 