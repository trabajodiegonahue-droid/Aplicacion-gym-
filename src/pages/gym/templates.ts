// Rutinas listas para días reales: en casa, de viaje, con poco tiempo o con molestias.
// Todos los nombres existen en la biblioteca (se valida en las pruebas).
export interface TemplateItem { name: string; sets: number; reps: number | null; rest: number; note?: string }
export interface RoutineTemplate { id: string; emoji: string; name: string; minutes: number; text: string; items: TemplateItem[] }

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'casa', emoji: '🏠', name: 'Casa sin equipo', minutes: 25, text: 'Cuerpo completo con tu peso. Ideal si no pudiste ir al gym.',
    items: [
      { name: 'Sentadilla con peso corporal', sets: 3, reps: 15, rest: 60 }, { name: 'Flexiones', sets: 3, reps: 10, rest: 60 },
      { name: 'Zancadas inversas', sets: 3, reps: 10, rest: 60 }, { name: 'Puente de glúteo', sets: 3, reps: 15, rest: 45 },
      { name: 'Remo invertido', sets: 3, reps: 10, rest: 60 }, { name: 'Plancha', sets: 3, reps: null, rest: 45, note: '30–45 s' },
    ],
  },
  {
    id: 'hotel', emoji: '🧳', name: 'Hotel / viaje (15 min)', minutes: 15, text: 'En la habitación, sin ruido ni equipo. Circuito rápido.',
    items: [
      { name: 'Sentadilla isométrica en pared', sets: 3, reps: null, rest: 30 }, { name: 'Flexiones inclinadas', sets: 3, reps: 12, rest: 30 },
      { name: 'Puente de glúteo', sets: 3, reps: 20, rest: 30 }, { name: 'Dead bug', sets: 3, reps: 12, rest: 30 },
      { name: 'Fondos en banco', sets: 3, reps: 12, rest: 30 },
    ],
  },
  {
    id: 'express', emoji: '⚡', name: 'Express 15 min con mancuernas', minutes: 15, text: 'Para días de trabajo o exámenes: lo justo para sumar.',
    items: [
      { name: 'Sentadilla goblet', sets: 3, reps: 12, rest: 45 }, { name: 'Press con mancuernas', sets: 3, reps: 10, rest: 45 },
      { name: 'Remo con mancuerna', sets: 3, reps: 10, rest: 45 }, { name: 'Peso muerto rumano con mancuernas', sets: 3, reps: 10, rest: 45 },
    ],
  },
  {
    id: 'core', emoji: '🧱', name: 'Core 10 min', minutes: 10, text: 'Abdomen y zona media completa. Se puede sumar a cualquier día.',
    items: [
      { name: 'Plancha', sets: 2, reps: null, rest: 30 }, { name: 'Dead bug', sets: 2, reps: 12, rest: 30 },
      { name: 'Crunch bicicleta', sets: 2, reps: 20, rest: 30 }, { name: 'Plancha lateral', sets: 2, reps: null, rest: 30 },
      { name: 'Elevación de piernas tumbado', sets: 2, reps: 12, rest: 30 }, { name: 'Superman', sets: 2, reps: 12, rest: 30 },
    ],
  },
  {
    id: 'suave', emoji: '🌱', name: 'Día suave / descarga', minutes: 20, text: 'Para cansancio, después de enfermarte o semana pesada.',
    items: [
      { name: 'Movilidad de cadera', sets: 1, reps: null, rest: 0 }, { name: 'Bird dog', sets: 2, reps: 10, rest: 30 },
      { name: 'Puente de glúteo', sets: 2, reps: 15, rest: 30 }, { name: 'Remo con banda', sets: 2, reps: 15, rest: 30 },
      { name: 'Caminata rápida', sets: 1, reps: null, rest: 0, note: '10 min' }, { name: 'Estiramientos', sets: 1, reps: null, rest: 0 },
    ],
  },
  {
    id: 'pierna_cuidada', emoji: '🩹', name: 'Tren superior (cuidando piernas)', minutes: 30, text: 'Si te molesta la rodilla o el tobillo: entrena sin cargarlos.',
    items: [
      { name: 'Press con mancuernas sentado', sets: 3, reps: 10, rest: 60 }, { name: 'Remo con mancuernas en banco inclinado', sets: 3, reps: 10, rest: 60 },
      { name: 'Press inclinado con mancuernas', sets: 3, reps: 10, rest: 60 }, { name: 'Elevaciones laterales', sets: 3, reps: 12, rest: 45 },
      { name: 'Curl martillo', sets: 3, reps: 12, rest: 45 }, { name: 'Extensión sobre la cabeza con mancuerna', sets: 3, reps: 12, rest: 45 },
    ],
  },
  {
    id: 'brazo_cuidado', emoji: '🦵', name: 'Piernas y core (cuidando hombro)', minutes: 30, text: 'Si te molesta el hombro o el codo: nada de empujes ni tirones.',
    items: [
      { name: 'Sentadilla goblet', sets: 3, reps: 12, rest: 60, note: 'peso al pecho, sin estirar brazos' }, { name: 'Zancadas inversas', sets: 3, reps: 10, rest: 60 },
      { name: 'Puente de glúteo', sets: 3, reps: 15, rest: 45 }, { name: 'Curl nórdico', sets: 3, reps: 6, rest: 60 },
      { name: 'Elevación de talones con mancuernas', sets: 3, reps: 15, rest: 45 }, { name: 'Dead bug', sets: 3, reps: 12, rest: 30 },
    ],
  },
  {
    id: 'juntos', emoji: '💞', name: 'Entreno en pareja (videollamada)', minutes: 20, text: 'Para hacer al mismo tiempo, cada uno en su casa. ¡Márquenlo como "juntos"!',
    items: [
      { name: 'Jumping jacks', sets: 2, reps: 30, rest: 30 }, { name: 'Sentadilla con peso corporal', sets: 3, reps: 15, rest: 45 },
      { name: 'Flexiones', sets: 3, reps: 10, rest: 45 }, { name: 'Mountain climbers', sets: 3, reps: 20, rest: 45 },
      { name: 'Puente de glúteo', sets: 3, reps: 15, rest: 45 }, { name: 'Plancha', sets: 2, reps: null, rest: 30 },
    ],
  },
]
