import { describe, expect, it } from 'vitest';
import {
  buildNeighbourhoodMedianHousingPpm,
  countsForNeighbourhoodHousingPpm,
  decodeHtmlEntities,
  getHousingMonthlyCost,
  getHousingPerSqm,
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

  it('soma aluguel, condomínio e IPTU na base de moradia', () => {
    expect(getHousingMonthlyCost({
      rentPrice: 1200,
      condoPrice: 300,
      iptuPrice: 50,
    })).toBe(1550);
    expect(getHousingMonthlyCost({
      rentPrice: 1200,
      condoIptu: 280,
    })).toBe(1480);
    expect(getHousingPerSqm({
      rentPrice: 1500,
      condoIptu: 500,
      area: 50,
    })).toBe(40);
  });

  it('exclui studios da base da mediana', () => {
    expect(countsForNeighbourhoodHousingPpm({
      isApartment: true,
      type: 'StudioOuKitchenette',
      title: 'Kitnet',
      area: 24,
      rentPrice: 1200,
      condoIptu: 100,
    })).toBe(false);
  });

  it('calcula mediana de moradia/m² por bairro normalizado', () => {
    const listings = [
      { neighbourhood: "Mont'Serrat", isApartment: true, type: 'Apartamento', title: 'Apto', area: 50, rentPrice: 1000, condoIptu: 1000 },
      { neighbourhood: 'Mont Serrat', isApartment: true, type: 'Apartamento', title: 'Apto', area: 50, rentPrice: 2000, condoIptu: 2000 },
      { neighbourhood: "Mont&#039;Serrat", isApartment: true, type: 'StudioOuKitchenette', title: 'Kitnet', area: 20, rentPrice: 3000, condoIptu: 3000 },
      { neighbourhood: 'Mont Serrat', isApartment: true, type: 'Apartamento', title: 'Apto', area: 50, rentPrice: 3000, condoIptu: 3000 },
    ];

    const result = buildNeighbourhoodMedianHousingPpm(listings);
    expect(result['mont serrat']).toBe(80);
    expect(median([40, 80, 120])).toBe(80);
    expect(decodeHtmlEntities('Passo d&amp;#039;Areia')).toBe("Passo d'Areia");
    expect(isCompactUnit('Apartamento JK', 'Apartamento JK · Centro')).toBe(true);
  });
});
