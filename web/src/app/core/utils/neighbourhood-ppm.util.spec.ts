import { describe, expect, it } from 'vitest';
import {
  buildNeighbourhoodMedianRentPpm,
  countsForNeighbourhoodRentPpm,
  decodeHtmlEntities,
  getRentPerSqm,
  isCompactUnit,
  median,
  neighbourhoodKey,
} from './neighbourhood-ppm.util';

describe('neighbourhood-ppm.util', () => {
  it('normaliza bairros com entidades HTML e apóstrofos', () => {
    expect(neighbourhoodKey("Mont&#039;Serrat")).toBe('mont serrat');
    expect(neighbourhoodKey("Passo d'Areia")).toBe('passo da areia');
    expect(neighbourhoodKey('Central Parque')).toBe('central park');
  });

  it('decodifica entidades HTML', () => {
    expect(decodeHtmlEntities('Passo d&amp;#039;Areia')).toBe("Passo d'Areia");
  });

  it('identifica unidades compactas', () => {
    expect(isCompactUnit('StudioOuKitchenette', 'Kitnet para aluguel')).toBe(true);
    expect(isCompactUnit('Apartamento JK', 'Apartamento JK · Centro')).toBe(true);
    expect(isCompactUnit('Apartamento', 'Apartamento 2 quartos')).toBe(false);
  });

  it('exclui studios da base da mediana', () => {
    expect(countsForNeighbourhoodRentPpm({
      isApartment: true,
      type: 'StudioOuKitchenette',
      title: 'Kitnet',
      area: 24,
      rentPrice: 1200,
    })).toBe(false);
    expect(countsForNeighbourhoodRentPpm({
      isApartment: true,
      type: 'Apartamento',
      title: 'Apartamento 2 quartos',
      area: 50,
      rentPrice: 1200,
    })).toBe(true);
  });

  it('calcula mediana de aluguel/m² por bairro normalizado', () => {
    const listings = [
      { neighbourhood: "Mont'Serrat", isApartment: true, type: 'Apartamento', title: 'Apto', area: 50, rentPrice: 1000 },
      { neighbourhood: 'Mont Serrat', isApartment: true, type: 'Apartamento', title: 'Apto', area: 50, rentPrice: 2000 },
      { neighbourhood: "Mont&#039;Serrat", isApartment: true, type: 'StudioOuKitchenette', title: 'Kitnet', area: 20, rentPrice: 3000 },
      { neighbourhood: 'Mont Serrat', isApartment: true, type: 'Apartamento', title: 'Apto', area: 50, rentPrice: 3000 },
    ];

    const result = buildNeighbourhoodMedianRentPpm(listings);
    expect(result['mont serrat']).toBe(40);
    expect(getRentPerSqm({ rentPrice: 1500, area: 50 })).toBe(30);
    expect(median([20, 40, 60])).toBe(40);
  });
});
