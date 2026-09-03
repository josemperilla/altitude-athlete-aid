// Declaraciones para el módulo JS portado de la app de gimnasio.
export type WeightGuide = {
  inicio: string;
  arranque: string;
  progresion: string;
  techo: string;
  aviso: string;
};
export const PICK_RULES: string[];
export const WEIGHT_GUIDE: Record<string, WeightGuide>;
