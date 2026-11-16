import type { MuscleGroup } from './types'

/** Equipamiento de cada ejercicio de la biblioteca. */
export const EQUIPMENT = {
  barra: 'Barra', mancuernas: 'Mancuernas', maquina: 'Máquina', polea: 'Polea', corporal: 'Peso corporal',
  kettlebell: 'Kettlebell', banda: 'Banda', smith: 'Multipower', cardio: 'Cardio', otro: 'Otro',
} as const
export type Equipment = keyof typeof EQUIPMENT

/**
 * Patrones de movimiento: para qué sirve el ejercicio y qué músculos trabaja (en %).
 * Los porcentajes son ESTIMACIONES ORIENTATIVAS de la participación relativa de cada músculo,
 * no mediciones de laboratorio: varían según técnica, rango y anatomía de cada persona.
 */
const PATTERNS: Record<string, { use: string; muscles: [string, number][] }> = {
  // Pecho
  press_plano: { use: 'Ejercicio base de empuje: desarrolla fuerza y volumen de pecho, tríceps y hombro.', muscles: [['Pectoral', 60], ['Tríceps', 25], ['Deltoide anterior', 15]] },
  press_inclinado: { use: 'Enfatiza la parte alta del pecho y el hombro frontal.', muscles: [['Pectoral superior', 55], ['Deltoide anterior', 25], ['Tríceps', 20]] },
  press_declinado: { use: 'Enfatiza la parte baja del pecho con menos estrés en el hombro.', muscles: [['Pectoral inferior', 60], ['Tríceps', 30], ['Deltoide anterior', 10]] },
  press_cerrado: { use: 'Empuje con foco en el tríceps; ideal para brazos más fuertes.', muscles: [['Tríceps', 55], ['Pectoral', 35], ['Deltoide anterior', 10]] },
  aperturas: { use: 'Aísla el pecho trabajando su estiramiento; complementa a los presses.', muscles: [['Pectoral', 80], ['Deltoide anterior', 15], ['Bíceps (estabiliza)', 5]] },
  cruce: { use: 'Aislamiento del pecho con tensión constante de la polea.', muscles: [['Pectoral', 80], ['Deltoide anterior', 15], ['Core', 5]] },
  flexiones: { use: 'Empuje con tu propio peso: pecho, tríceps y estabilidad del core. Se puede hacer en cualquier lugar.', muscles: [['Pectoral', 50], ['Tríceps', 25], ['Deltoide anterior', 15], ['Core', 10]] },
  fondos_pecho: { use: 'Empuje vertical con el torso inclinado: pecho inferior y tríceps.', muscles: [['Pectoral inferior', 50], ['Tríceps', 35], ['Deltoide anterior', 15]] },
  pullover: { use: 'Trabaja dorsal y pecho a la vez y mejora la movilidad del hombro.', muscles: [['Dorsal', 45], ['Pectoral', 40], ['Tríceps', 15]] },
  // Espalda
  dominadas: { use: 'El mejor ejercicio de tracción vertical: espalda ancha y bíceps fuertes.', muscles: [['Dorsal ancho', 55], ['Bíceps', 20], ['Romboides y trapecio', 15], ['Core', 10]] },
  jalon: { use: 'Tracción vertical guiada: construye amplitud de espalda y prepara para dominadas.', muscles: [['Dorsal ancho', 60], ['Bíceps', 20], ['Romboides', 20]] },
  brazos_rectos: { use: 'Aísla el dorsal sin que intervenga el bíceps.', muscles: [['Dorsal ancho', 75], ['Redondo mayor', 15], ['Tríceps (cabeza larga)', 10]] },
  remo: { use: 'Tracción horizontal: grosor de espalda y mejor postura.', muscles: [['Dorsal ancho', 40], ['Romboides y trapecio medio', 30], ['Bíceps', 15], ['Deltoide posterior', 15]] },
  peso_muerto: { use: 'Ejercicio de fuerza total: cadena posterior completa (espalda, glúteo e isquios).', muscles: [['Isquiotibiales', 30], ['Glúteo', 25], ['Erectores espinales', 25], ['Trapecio', 10], ['Cuádriceps', 10]] },
  peso_muerto_sumo: { use: 'Variante con piernas abiertas: más glúteo y aductores, menos espalda baja.', muscles: [['Glúteo', 30], ['Cuádriceps', 25], ['Aductores', 20], ['Isquiotibiales', 15], ['Erectores espinales', 10]] },
  rack_pull: { use: 'Peso muerto parcial: espalda alta y bloqueo fuertes.', muscles: [['Erectores espinales', 35], ['Trapecio', 30], ['Glúteo', 20], ['Isquiotibiales', 15]] },
  hiperextension: { use: 'Fortalece la zona lumbar y el glúteo; previene molestias de espalda.', muscles: [['Erectores espinales', 50], ['Glúteo', 30], ['Isquiotibiales', 20]] },
  buenos_dias: { use: 'Bisagra de cadera con barra: isquios y espalda baja.', muscles: [['Isquiotibiales', 45], ['Erectores espinales', 35], ['Glúteo', 20]] },
  encogimientos: { use: 'Aísla el trapecio superior (zona del cuello).', muscles: [['Trapecio superior', 85], ['Antebrazo (agarre)', 15]] },
  // Hombros
  press_hombro: { use: 'Empuje vertical: hombros redondos y fuertes, con ayuda del tríceps.', muscles: [['Deltoide anterior', 45], ['Deltoide lateral', 25], ['Tríceps', 25], ['Core', 5]] },
  arnold: { use: 'Press con rotación: recorre más fibras del hombro.', muscles: [['Deltoide anterior', 40], ['Deltoide lateral', 35], ['Tríceps', 25]] },
  elev_lateral: { use: 'Aísla el deltoide lateral: hombros más anchos.', muscles: [['Deltoide lateral', 80], ['Trapecio', 15], ['Deltoide anterior', 5]] },
  elev_frontal: { use: 'Aísla la parte frontal del hombro.', muscles: [['Deltoide anterior', 75], ['Pectoral superior', 15], ['Trapecio', 10]] },
  posterior: { use: 'Trabaja la parte trasera del hombro: equilibrio y postura.', muscles: [['Deltoide posterior', 60], ['Romboides', 25], ['Trapecio medio', 15]] },
  face_pull: { use: 'Salud del hombro: deltoide posterior y manguito rotador. Muy recomendado.', muscles: [['Deltoide posterior', 45], ['Trapecio medio', 30], ['Manguito rotador', 25]] },
  remo_menton: { use: 'Deltoide lateral y trapecio en un solo movimiento.', muscles: [['Deltoide lateral', 45], ['Trapecio', 40], ['Bíceps', 15]] },
  push_press: { use: 'Press con impulso de piernas: potencia y fuerza de todo el cuerpo.', muscles: [['Deltoides', 40], ['Tríceps', 25], ['Cuádriceps', 20], ['Glúteo', 15]] },
  pike: { use: 'Empuje vertical con peso corporal: progresión hacia el pino.', muscles: [['Deltoide anterior', 50], ['Tríceps', 35], ['Core', 15]] },
  rot_externa: { use: 'Fortalece el manguito rotador; previene lesiones de hombro.', muscles: [['Manguito rotador', 85], ['Deltoide posterior', 15]] },
  // Bíceps
  curl: { use: 'Aísla el bíceps: fuerza y volumen del brazo.', muscles: [['Bíceps', 75], ['Braquial', 15], ['Antebrazo', 10]] },
  martillo: { use: 'Agarre neutro: braquial y antebrazo, dan grosor al brazo.', muscles: [['Braquial', 40], ['Braquiorradial', 35], ['Bíceps', 25]] },
  curl_invertido: { use: 'Agarre prono: antebrazo y braquial, mejora el agarre.', muscles: [['Braquiorradial', 50], ['Braquial', 30], ['Bíceps', 20]] },
  zottman: { use: 'Combina curl normal y martillo: bíceps y antebrazo.', muscles: [['Bíceps', 40], ['Braquiorradial', 35], ['Braquial', 25]] },
  // Tríceps
  ext_triceps: { use: 'Aísla el tríceps (cabezas lateral y medial).', muscles: [['Tríceps', 90], ['Antebrazo (estabiliza)', 10]] },
  ext_overhead: { use: 'Tríceps estirado sobre la cabeza: enfatiza la cabeza larga.', muscles: [['Tríceps cabeza larga', 70], ['Tríceps lateral y medial', 25], ['Core', 5]] },
  fondos: { use: 'Empuje con peso corporal: tríceps fuerte con ayuda del pecho.', muscles: [['Tríceps', 55], ['Pectoral', 30], ['Deltoide anterior', 15]] },
  // Piernas
  sentadilla: { use: 'El rey de piernas: fuerza y volumen de cuádriceps y glúteo.', muscles: [['Cuádriceps', 50], ['Glúteo', 30], ['Aductores', 12], ['Core y lumbar', 8]] },
  sentadilla_frontal: { use: 'Barra delante: más cuádriceps y torso erguido.', muscles: [['Cuádriceps', 60], ['Glúteo', 20], ['Core', 15], ['Aductores', 5]] },
  goblet: { use: 'Sentadilla con peso al pecho: ideal para aprender la técnica.', muscles: [['Cuádriceps', 50], ['Glúteo', 30], ['Core', 12], ['Aductores', 8]] },
  sentadilla_sumo: { use: 'Piernas abiertas: más aductores y glúteo.', muscles: [['Aductores', 35], ['Glúteo', 35], ['Cuádriceps', 30]] },
  prensa: { use: 'Empuje de piernas guiado: mucho cuádriceps con espalda apoyada.', muscles: [['Cuádriceps', 60], ['Glúteo', 25], ['Aductores', 10], ['Isquiotibiales', 5]] },
  zancada: { use: 'Unilateral: piernas y glúteo, corrige desequilibrios entre lados.', muscles: [['Cuádriceps', 45], ['Glúteo', 40], ['Aductores', 10], ['Isquiotibiales', 5]] },
  bulgara: { use: 'Unilateral exigente con pie atrasado: glúteo y cuádriceps.', muscles: [['Cuádriceps', 45], ['Glúteo', 40], ['Aductores', 10], ['Core', 5]] },
  rumano: { use: 'Bisagra de cadera: isquiotibiales y glúteo; protege la espalda baja.', muscles: [['Isquiotibiales', 50], ['Glúteo', 35], ['Erectores espinales', 15]] },
  rumano_unilateral: { use: 'Rumano a una pierna: isquios, glúteo y equilibrio.', muscles: [['Isquiotibiales', 45], ['Glúteo', 40], ['Core y estabilizadores', 15]] },
  ext_cuadriceps: { use: 'Aísla el cuádriceps; útil para terminar la sesión.', muscles: [['Cuádriceps', 100]] },
  curl_femoral: { use: 'Aísla los isquiotibiales (parte trasera del muslo).', muscles: [['Isquiotibiales', 90], ['Gemelos', 10]] },
  nordico: { use: 'Isquios muy fuertes en excéntrico; previene desgarros.', muscles: [['Isquiotibiales', 90], ['Gemelos', 10]] },
  talones_pie: { use: 'Pantorrillas: gemelo (pierna estirada).', muscles: [['Gemelos', 70], ['Sóleo', 30]] },
  talones_sentado: { use: 'Pantorrillas: sóleo (rodilla doblada).', muscles: [['Sóleo', 70], ['Gemelos', 30]] },
  aductores: { use: 'Aísla la cara interna del muslo.', muscles: [['Aductores', 100]] },
  pistol: { use: 'Sentadilla a una pierna: fuerza, equilibrio y movilidad.', muscles: [['Cuádriceps', 50], ['Glúteo', 30], ['Core', 20]] },
  isometrica: { use: 'Resistencia del cuádriceps sin movimiento.', muscles: [['Cuádriceps', 75], ['Glúteo', 25]] },
  salto: { use: 'Potencia y explosividad de piernas.', muscles: [['Cuádriceps', 45], ['Glúteo', 35], ['Gemelos', 20]] },
  // Glúteos
  hip_thrust: { use: 'El mejor para glúteo: máxima tensión en extensión de cadera.', muscles: [['Glúteo mayor', 70], ['Isquiotibiales', 15], ['Cuádriceps', 10], ['Core', 5]] },
  patada: { use: 'Aísla el glúteo mayor.', muscles: [['Glúteo mayor', 80], ['Isquiotibiales', 20]] },
  abduccion: { use: 'Glúteo medio: cadera estable y glúteo más redondo.', muscles: [['Glúteo medio', 70], ['Glúteo menor', 20], ['Tensor de la fascia lata', 10]] },
  pull_through: { use: 'Bisagra de cadera en polea: glúteo e isquios.', muscles: [['Glúteo', 55], ['Isquiotibiales', 35], ['Erectores espinales', 10]] },
  swing: { use: 'Potencia de cadera y cardio a la vez.', muscles: [['Glúteo', 40], ['Isquiotibiales', 30], ['Core', 15], ['Hombros y espalda', 15]] },
  frog_pump: { use: 'Glúteo aislado con mucho volumen y poca carga.', muscles: [['Glúteo', 90], ['Aductores', 10]] },
  // Abdomen
  plancha: { use: 'Core estable: protege la espalda y mejora la postura.', muscles: [['Recto abdominal', 40], ['Transverso', 35], ['Oblicuos', 15], ['Hombros', 10]] },
  plancha_lateral: { use: 'Oblicuos y estabilidad lateral.', muscles: [['Oblicuos', 60], ['Transverso', 20], ['Glúteo medio', 20]] },
  crunch: { use: 'Aísla el recto abdominal ("six pack").', muscles: [['Recto abdominal', 85], ['Oblicuos', 15]] },
  piernas_abs: { use: 'Abdomen inferior y flexores de cadera.', muscles: [['Recto abdominal (inferior)', 55], ['Flexores de cadera', 35], ['Oblicuos', 10]] },
  oblicuos: { use: 'Rotación del tronco: oblicuos y cintura.', muscles: [['Oblicuos', 60], ['Recto abdominal', 30], ['Flexores de cadera', 10]] },
  antirrotacion: { use: 'Core profundo y control: ideal para cuidar la espalda.', muscles: [['Transverso', 50], ['Oblicuos', 35], ['Recto abdominal', 15]] },
  rueda: { use: 'Core muy intenso en extensión.', muscles: [['Recto abdominal', 55], ['Dorsal', 20], ['Transverso', 15], ['Hombros', 10]] },
  mountain: { use: 'Core + cardio: quema calorías y estabiliza.', muscles: [['Core', 40], ['Flexores de cadera', 30], ['Hombros', 20], ['Cuádriceps', 10]] },
  granjero: { use: 'Agarre, trapecio y core caminando con peso.', muscles: [['Antebrazo (agarre)', 40], ['Trapecio', 30], ['Core', 30]] },
  // Cardio
  correr: { use: 'Cardio: corazón y pulmones más fuertes, quema calorías.', muscles: [['Cuádriceps', 30], ['Gemelos', 25], ['Isquiotibiales', 20], ['Glúteo', 15], ['Core', 10]] },
  caminar: { use: 'Cardio suave: salud del corazón y recuperación activa.', muscles: [['Gemelos', 30], ['Cuádriceps', 25], ['Glúteo', 25], ['Isquiotibiales', 20]] },
  inclinada: { use: 'Caminar en pendiente: cardio con mucho glúteo.', muscles: [['Glúteo', 35], ['Gemelos', 30], ['Isquiotibiales', 20], ['Cuádriceps', 15]] },
  bici: { use: 'Cardio de bajo impacto para las rodillas.', muscles: [['Cuádriceps', 50], ['Glúteo', 25], ['Isquiotibiales', 15], ['Gemelos', 10]] },
  eliptica: { use: 'Cardio de cuerpo completo y bajo impacto.', muscles: [['Cuádriceps', 35], ['Glúteo', 25], ['Isquiotibiales', 20], ['Brazos y hombros', 20]] },
  remo_maquina: { use: 'Cardio de cuerpo completo: piernas, espalda y brazos.', muscles: [['Cuádriceps', 35], ['Dorsal', 25], ['Glúteo', 15], ['Brazos', 15], ['Core', 10]] },
  escaleras: { use: 'Cardio intenso con mucho glúteo y pierna.', muscles: [['Glúteo', 40], ['Cuádriceps', 35], ['Gemelos', 25]] },
  air_bike: { use: 'Cardio muy intenso de cuerpo completo.', muscles: [['Cuádriceps', 40], ['Hombros y brazos', 25], ['Glúteo', 20], ['Core', 15]] },
  cuerda: { use: 'Cardio, coordinación y pantorrillas.', muscles: [['Gemelos', 50], ['Hombros', 20], ['Cuádriceps', 15], ['Core', 15]] },
  hiit: { use: 'Alta intensidad: mucho gasto calórico en poco tiempo.', muscles: [['Cuádriceps', 30], ['Core', 25], ['Pecho y hombros', 25], ['Glúteo', 20]] },
  ski_erg: { use: 'Cardio de tren superior y core.', muscles: [['Dorsal', 35], ['Tríceps', 25], ['Core', 25], ['Glúteo', 15]] },
  natacion: { use: 'Cardio completo sin impacto en articulaciones.', muscles: [['Dorsal', 35], ['Hombros', 25], ['Core', 20], ['Piernas', 20]] },
  boxeo: { use: 'Cardio, coordinación y descarga de estrés.', muscles: [['Hombros', 35], ['Core', 30], ['Piernas', 20], ['Brazos', 15]] },
  // Otros
  olimpico: { use: 'Potencia y explosividad de todo el cuerpo (requiere buena técnica).', muscles: [['Glúteo', 25], ['Cuádriceps', 25], ['Trapecio', 20], ['Isquiotibiales', 15], ['Hombros', 15]] },
  thruster: { use: 'Sentadilla + press: cuerpo completo y cardio.', muscles: [['Cuádriceps', 35], ['Deltoides', 30], ['Glúteo', 20], ['Tríceps', 15]] },
  get_up: { use: 'Estabilidad total: hombro, core y cadera.', muscles: [['Core', 35], ['Hombros', 35], ['Glúteo', 30]] },
  box_jump: { use: 'Potencia de piernas y salto.', muscles: [['Cuádriceps', 40], ['Glúteo', 30], ['Gemelos', 30]] },
  cuerdas_batalla: { use: 'Cardio de tren superior y core.', muscles: [['Hombros', 45], ['Core', 30], ['Brazos', 25]] },
  trineo: { use: 'Fuerza y acondicionamiento de piernas sin impacto.', muscles: [['Cuádriceps', 30], ['Glúteo', 30], ['Gemelos', 20], ['Core', 20]] },
  neumatico: { use: 'Fuerza funcional de todo el cuerpo.', muscles: [['Glúteo', 30], ['Erectores espinales', 25], ['Cuádriceps', 20], ['Brazos y hombros', 25]] },
  movilidad: { use: 'Mejora la flexibilidad y el rango de movimiento; ayuda a recuperar.', muscles: [['Flexibilidad general', 100]] },
  yoga: { use: 'Flexibilidad, equilibrio y control del cuerpo; reduce el estrés.', muscles: [['Core', 35], ['Flexibilidad general', 40], ['Equilibrio', 25]] },
  pilates: { use: 'Core fuerte, postura y control del movimiento.', muscles: [['Core', 60], ['Glúteo', 20], ['Flexibilidad', 20]] },
  agarre: { use: 'Fuerza de agarre para levantar más en todos los ejercicios.', muscles: [['Antebrazo (agarre)', 100]] },
  muneca: { use: 'Antebrazos más fuertes y muñecas sanas.', muscles: [['Flexores del antebrazo', 100]] },
}

export interface LibraryExercise { name: string; group: MuscleGroup; equipment: Equipment; pattern: string }

// "Nombre|equipo|patrón" — sin comas en los nombres.
const RAW: Record<MuscleGroup, string[]> = {
  pecho: [
    'Press banca|barra|press_plano', 'Press banca inclinado|barra|press_inclinado', 'Press banca declinado|barra|press_declinado', 'Press banca agarre cerrado|barra|press_cerrado',
    'Press con mancuernas|mancuernas|press_plano', 'Press inclinado con mancuernas|mancuernas|press_inclinado', 'Press declinado con mancuernas|mancuernas|press_declinado',
    'Aperturas con mancuernas|mancuernas|aperturas', 'Aperturas inclinadas con mancuernas|mancuernas|aperturas', 'Pullover con mancuerna|mancuernas|pullover',
    'Press de pecho en máquina|maquina|press_plano', 'Press inclinado en máquina|maquina|press_inclinado', 'Contractor de pecho (pec deck)|maquina|aperturas',
    'Cruce de poleas|polea|cruce', 'Cruce de poleas desde abajo|polea|cruce', 'Aperturas en polea baja|polea|cruce',
    'Press banca en multipower|smith|press_plano', 'Press inclinado en multipower|smith|press_inclinado',
    'Flexiones|corporal|flexiones', 'Flexiones inclinadas|corporal|flexiones', 'Flexiones declinadas|corporal|flexiones', 'Flexiones diamante|corporal|press_cerrado',
    'Flexiones con palmada|corporal|flexiones', 'Fondos en paralelas (pecho)|corporal|fondos_pecho', 'Flexiones con banda|banda|flexiones',
  ],
  espalda: [
    'Dominadas|corporal|dominadas', 'Dominadas supinas|corporal|dominadas', 'Dominadas agarre neutro|corporal|dominadas', 'Dominadas asistidas|maquina|dominadas',
    'Jalón al pecho|polea|jalon', 'Jalón agarre estrecho|polea|jalon', 'Jalón tras nuca|polea|jalon', 'Jalón con brazos rectos|polea|brazos_rectos',
    'Remo en polea baja|polea|remo', 'Remo en polea con agarre ancho|polea|remo', 'Remo con barra|barra|remo', 'Remo Pendlay|barra|remo',
    'Remo con barra T|barra|remo', 'Remo con mancuerna|mancuernas|remo', 'Remo con mancuernas en banco inclinado|mancuernas|remo',
    'Remo en máquina|maquina|remo', 'Remo Hammer|maquina|remo', 'Remo invertido|corporal|remo', 'Peso muerto|barra|peso_muerto',
    'Peso muerto sumo|barra|peso_muerto_sumo', 'Rack pull|barra|rack_pull', 'Hiperextensiones|corporal|hiperextension', 'Buenos días|barra|buenos_dias',
    'Pullover en polea|polea|brazos_rectos', 'Remo con kettlebell|kettlebell|remo', 'Remo con banda|banda|remo', 'Encogimientos con barra|barra|encogimientos',
    'Encogimientos con mancuernas|mancuernas|encogimientos',
  ],
  hombros: [
    'Press militar|barra|press_hombro', 'Press militar sentado|barra|press_hombro', 'Press con mancuernas sentado|mancuernas|press_hombro', 'Press Arnold|mancuernas|arnold',
    'Press de hombro en máquina|maquina|press_hombro', 'Press de hombro en multipower|smith|press_hombro', 'Elevaciones laterales|mancuernas|elev_lateral',
    'Elevaciones laterales en polea|polea|elev_lateral', 'Elevaciones laterales en máquina|maquina|elev_lateral', 'Elevaciones frontales|mancuernas|elev_frontal',
    'Elevaciones frontales con disco|otro|elev_frontal', 'Elevaciones frontales en polea|polea|elev_frontal', 'Pájaros (posterior)|mancuernas|posterior',
    'Posterior en máquina (pec deck inverso)|maquina|posterior', 'Face pull|polea|face_pull', 'Remo al mentón|barra|remo_menton', 'Remo al mentón en polea|polea|remo_menton',
    'Push press|barra|push_press', 'Pike push-up|corporal|pike', 'Elevaciones en Y con banda|banda|posterior', 'Rotación externa en polea|polea|rot_externa',
  ],
  biceps: [
    'Curl con barra|barra|curl', 'Curl con barra Z|barra|curl', 'Curl con mancuernas|mancuernas|curl', 'Curl alterno|mancuernas|curl',
    'Curl martillo|mancuernas|martillo', 'Curl concentrado|mancuernas|curl', 'Curl inclinado con mancuernas|mancuernas|curl',
    'Curl en banco Scott|barra|curl', 'Curl Scott con mancuerna|mancuernas|curl', 'Curl en polea|polea|curl', 'Curl con cuerda en polea|polea|martillo',
    'Curl en polea alta (bayesian)|polea|curl', 'Curl en máquina|maquina|curl', 'Curl araña|mancuernas|curl', 'Curl invertido|barra|curl_invertido',
    'Curl con banda|banda|curl', 'Curl Zottman|mancuernas|zottman',
  ],
  triceps: [
    'Extensión en polea con cuerda|polea|ext_triceps', 'Extensión en polea con barra|polea|ext_triceps', 'Extensión en polea a una mano|polea|ext_triceps',
    'Extensión sobre la cabeza en polea|polea|ext_overhead', 'Press francés|barra|ext_overhead', 'Press francés con mancuernas|mancuernas|ext_overhead',
    'Extensión sobre la cabeza con mancuerna|mancuernas|ext_overhead', 'Patada de tríceps|mancuernas|ext_triceps', 'Patada de tríceps en polea|polea|ext_triceps',
    'Fondos en paralelas|corporal|fondos', 'Fondos en banco|corporal|fondos', 'Fondos en máquina|maquina|fondos', 'Press cerrado|barra|press_cerrado',
    'Extensión de tríceps en máquina|maquina|ext_triceps', 'Flexiones cerradas|corporal|press_cerrado', 'Extensión con banda|banda|ext_triceps',
  ],
  piernas: [
    'Sentadilla con barra|barra|sentadilla', 'Sentadilla frontal|barra|sentadilla_frontal', 'Sentadilla goblet|mancuernas|goblet', 'Sentadilla en multipower|smith|sentadilla',
    'Sentadilla hack|maquina|prensa', 'Sentadilla búlgara|mancuernas|bulgara', 'Sentadilla sumo|mancuernas|sentadilla_sumo', 'Sentadilla con peso corporal|corporal|sentadilla',
    'Sentadilla con salto|corporal|salto', 'Sentadilla con kettlebell|kettlebell|goblet', 'Prensa|maquina|prensa', 'Prensa a una pierna|maquina|prensa',
    'Zancadas|mancuernas|zancada', 'Zancadas caminando|mancuernas|zancada', 'Zancadas inversas|mancuernas|zancada', 'Zancadas con barra|barra|zancada',
    'Step-up al banco|mancuernas|zancada', 'Peso muerto rumano|barra|rumano', 'Peso muerto rumano con mancuernas|mancuernas|rumano',
    'Peso muerto a una pierna|mancuernas|rumano_unilateral', 'Extensión de cuádriceps|maquina|ext_cuadriceps', 'Curl femoral tumbado|maquina|curl_femoral',
    'Curl femoral sentado|maquina|curl_femoral', 'Curl nórdico|corporal|nordico', 'Elevación de talones de pie|maquina|talones_pie',
    'Elevación de talones sentado|maquina|talones_sentado', 'Elevación de talones en prensa|maquina|talones_pie', 'Elevación de talones con mancuernas|mancuernas|talones_pie',
    'Aductores en máquina|maquina|aductores', 'Sentadilla pistol|corporal|pistol', 'Sentadilla isométrica en pared|corporal|isometrica', 'Belt squat|maquina|sentadilla',
  ],
  gluteos: [
    'Hip thrust|barra|hip_thrust', 'Hip thrust en máquina|maquina|hip_thrust', 'Hip thrust a una pierna|corporal|hip_thrust', 'Puente de glúteo|corporal|hip_thrust',
    'Puente de glúteo con barra|barra|hip_thrust', 'Patada de glúteo en polea|polea|patada', 'Patada de glúteo en máquina|maquina|patada',
    'Patada de glúteo en cuadrupedia|corporal|patada', 'Abducción de cadera en máquina|maquina|abduccion', 'Abducción con banda|banda|abduccion',
    'Caminata lateral con banda|banda|abduccion', 'Clamshell con banda|banda|abduccion', 'Peso muerto sumo con mancuerna|mancuernas|peso_muerto_sumo',
    'Pull through en polea|polea|pull_through', 'Hiperextensión enfocada en glúteo|corporal|hiperextension', 'Frog pump|corporal|frog_pump',
    'Swing con kettlebell|kettlebell|swing', 'Step-up lateral|mancuernas|zancada', 'Sentadilla búlgara enfocada en glúteo|mancuernas|bulgara',
  ],
  abdomen: [
    'Plancha|corporal|plancha', 'Plancha lateral|corporal|plancha_lateral', 'Plancha con toque de hombro|corporal|antirrotacion', 'Crunch|corporal|crunch',
    'Crunch en polea|polea|crunch', 'Crunch en máquina|maquina|crunch', 'Crunch inverso|corporal|piernas_abs', 'Crunch bicicleta|corporal|oblicuos',
    'Elevación de piernas tumbado|corporal|piernas_abs', 'Elevación de piernas colgado|corporal|piernas_abs', 'Elevación de rodillas en paralelas|corporal|piernas_abs',
    'Rueda abdominal|otro|rueda', 'Russian twist|corporal|oblicuos', 'Mountain climbers|corporal|mountain', 'Dead bug|corporal|antirrotacion', 'Bird dog|corporal|antirrotacion',
    'Pallof press|polea|antirrotacion', 'Leñador en polea|polea|oblicuos', 'Hollow hold|corporal|plancha', 'V-ups|corporal|piernas_abs', 'Tijeras|corporal|piernas_abs',
    'Toques de talón|corporal|oblicuos', 'Sit-ups|corporal|crunch', 'Paseo del granjero|mancuernas|granjero',
  ],
  cardio: [
    'Cinta (caminar)|cardio|caminar', 'Cinta (correr)|cardio|correr', 'Cinta inclinada|cardio|inclinada', 'Bicicleta estática|cardio|bici', 'Spinning|cardio|bici',
    'Elíptica|cardio|eliptica', 'Remo (máquina)|cardio|remo_maquina', 'Escaladora|cardio|escaleras', 'Air bike|cardio|air_bike', 'Saltar la cuerda|otro|cuerda',
    'Burpees|corporal|hiit', 'Jumping jacks|corporal|hiit', 'Rodillas arriba|corporal|hiit', 'Sprints|corporal|correr', 'HIIT|corporal|hiit',
    'Ski erg|cardio|ski_erg', 'Subir escaleras|corporal|escaleras', 'Caminata rápida|corporal|caminar', 'Natación|otro|natacion', 'Boxeo / saco|otro|boxeo',
  ],
  otros: [
    'Clean (cargada)|barra|olimpico', 'Snatch (arrancada)|barra|olimpico', 'Thruster|barra|thruster', 'Clean con kettlebell|kettlebell|olimpico',
    'Turkish get-up|kettlebell|get_up', 'Wall ball|otro|thruster', 'Box jump|otro|box_jump', 'Battle ropes|otro|cuerdas_batalla', 'Arrastre de trineo|otro|trineo',
    'Volteo de neumático|otro|neumatico', 'Estiramientos|corporal|movilidad', 'Movilidad de cadera|corporal|movilidad', 'Foam roller|otro|movilidad',
    'Yoga|corporal|yoga', 'Pilates|corporal|pilates', 'Agarre (pinza con discos)|otro|agarre', 'Curl de muñeca|mancuernas|muneca',
  ],
}

export const EXERCISE_LIBRARY: LibraryExercise[] = Object.entries(RAW).flatMap(([group, list]) =>
  list.map(item => { const [name, equipment, pattern] = item.split('|'); return { name, group: group as MuscleGroup, equipment: equipment as Equipment, pattern } }))

export const libraryByName = new Map(EXERCISE_LIBRARY.map(e => [e.name.toLowerCase(), e]))

/** Para qué sirve y qué músculos trabaja (estimación) un ejercicio por su nombre. */
export function exerciseInfo(name: string) {
  const lib = libraryByName.get(name.toLowerCase())
  const p = lib ? PATTERNS[lib.pattern] : undefined
  return p ? { use: p.use, muscles: p.muscles } : null
}

/** Búsqueda sin tildes ni mayúsculas. */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Comprobación interna: cada patrón suma 100 % y cada ejercicio tiene patrón. */
export function validateLibrary() {
  const bad: string[] = []
  for (const [k, p] of Object.entries(PATTERNS)) if (p.muscles.reduce((s, [, v]) => s + v, 0) !== 100) bad.push('patrón ' + k)
  for (const e of EXERCISE_LIBRARY) if (!PATTERNS[e.pattern]) bad.push('ejercicio ' + e.name)
  return bad
}
