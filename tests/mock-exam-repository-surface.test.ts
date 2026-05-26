import { describe, expect, it } from 'vitest'
import * as repository from '../src/lib/mock-exam/repository'

describe('Mock Exam repository public surface', () => {
  it('exposes only the scope-aware repository accessor at runtime', () => {
    expect(Object.keys(repository).sort()).toEqual(['getMockExamDraftRepository'])
  })
})
