-- Adiciona a ficha de cultivo de Vanda (híbridos) ao guia de espécies.
-- Idempotente: não duplica se já existir uma ficha com o mesmo display_name.

INSERT INTO species (
  genus,
  epithet,
  display_name,
  common_names,
  temp_day_min,
  temp_day_max,
  temp_night_min,
  temp_night_max,
  humidity_min,
  humidity_max,
  light,
  watering,
  fertilizing,
  substrate,
  bloom_months,
  rest_period,
  notes
) VALUES (
  'Vanda',
  NULL,
  'Vanda (híbridos)',
  ARRAY['vanda', 'orquídea-vanda']::text[],
  22,
  35,
  16,
  24,
  60,
  85,
  'Muita luz; sol da manhã ou sol filtrado (30–50% de sombrite). Pouca luz impede a floração.',
  'Raízes expostas: molhar abundantemente todos os dias no calor, até 2x em dias muito secos; no frio, regar pela manhã e reduzir a frequência. As raízes devem secar até a noite.',
  'Adubo foliar diluído (1/4 da dose) semanalmente na fase de crescimento; lavar as raízes só com água uma vez por mês para evitar acúmulo de sais.',
  'Cesto de madeira sem substrato ou raízes nuas penduradas; boa ventilação é essencial.',
  ARRAY[3, 4, 9, 10, 11]::integer[],
  'Sem repouso definido; reduzir rega e adubo quando as noites ficarem abaixo de 15 °C.',
  'Sensível a frio abaixo de 12 °C. Híbridos bem cultivados podem florir 2–3 vezes por ano.'
)
ON CONFLICT (display_name) DO NOTHING;
