/**
 * Tests for Croatian/English internationalization
 */

import hrMessages from '../messages/hr.json'
import enMessages from '../messages/en.json'

describe('Internationalization', () => {
  test('Croatian messages file exists and has required keys', () => {
    expect(hrMessages).toBeDefined()
    expect(hrMessages.HomePage).toBeDefined()
    expect(hrMessages.Navigation).toBeDefined()
    expect(hrMessages.Assessment).toBeDefined()
    expect(hrMessages.Common).toBeDefined()
    expect(hrMessages.Auth).toBeDefined()
    expect(hrMessages.Measures).toBeDefined()
  })

  test('English messages file exists and has required keys', () => {
    expect(enMessages).toBeDefined()
    expect(enMessages.HomePage).toBeDefined()
    expect(enMessages.Navigation).toBeDefined()
    expect(enMessages.Assessment).toBeDefined()
    expect(enMessages.Common).toBeDefined()
    expect(enMessages.Auth).toBeDefined()
    expect(enMessages.Measures).toBeDefined()
  })

  test('Croatian and English messages have matching structure', () => {
    const hrKeys = Object.keys(hrMessages)
    const enKeys = Object.keys(enMessages)
    
    expect(hrKeys.sort()).toEqual(enKeys.sort())
  })

  test('Croatian diacritics are properly preserved', () => {
    expect(hrMessages.HomePage.title).toContain('č')
    expect(hrMessages.Assessment.securityLevels.osnovna).toContain('Osnovna')
    expect(hrMessages.Measures.M01).toContain('Politike')
  })

  test('Croatian compliance terminology is accurate', () => {
    expect(hrMessages.Assessment.securityLevels.osnovna).toBe('Osnovna razina sigurnosti')
    expect(hrMessages.Assessment.securityLevels.srednja).toBe('Srednja razina sigurnosti')
    expect(hrMessages.Assessment.securityLevels.napredna).toBe('Napredna razina sigurnosti')
    
    expect(hrMessages.Assessment.controls.documentation).toBe('Razina dokumentacije')
    expect(hrMessages.Assessment.controls.implementation).toBe('Razina implementacije')
    expect(hrMessages.Assessment.controls.mandatory).toBe('Obavezno')
    expect(hrMessages.Assessment.controls.voluntary).toBe('Dobrovoljno')
  })

  test('All 13 measures are defined in Croatian', () => {
    const measureKeys = Object.keys(hrMessages.Measures)
    expect(measureKeys).toHaveLength(13)
    
    for (let i = 1; i <= 13; i++) {
      const key = `M${i.toString().padStart(2, '0')}`
      expect(hrMessages.Measures).toHaveProperty(key)
      expect(hrMessages.Measures[key as keyof typeof hrMessages.Measures]).toBeTruthy()
    }
  })

  test('English translations are professional and accurate', () => {
    expect(enMessages.HomePage.title).toBe('AI Cybersecurity Self-Assessment')
    expect(enMessages.Assessment.securityLevels.osnovna).toBe('Basic security level')
    expect(enMessages.Assessment.securityLevels.srednja).toBe('Medium security level')
    expect(enMessages.Assessment.securityLevels.napredna).toBe('Advanced security level')
  })
})