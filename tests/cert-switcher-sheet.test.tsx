import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CertSwitcherSheet } from '../src/components/domain/cert-switcher-sheet'
import type { CertCode } from '../src/data/types'
import { READY_CERTS } from '../src/lib/cert-catalog'
import { LocalProgressRepository } from '../src/repositories/local-progress-repository'
import { usePrefsStore } from '../src/stores/prefs-store'

const defaultReadyCerts = [...READY_CERTS]

beforeEach(() => {
  localStorage.clear()
  READY_CERTS.splice(0, READY_CERTS.length, ...defaultReadyCerts)
  usePrefsStore.setState({ locale: 'en' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CertSwitcherSheet', () => {
  it('renders the current cert progress and browse-all action', () => {
    const onBrowseAll = vi.fn()

    render(
      <CertSwitcherSheet
        open
        onClose={vi.fn()}
        onBrowseAll={onBrowseAll}
        onSelectCert={vi.fn()}
        currentCert="DVA-C02"
        answered={147}
        total={557}
        accuracy={78}
      />,
    )

    expect(screen.getByText('Switch certification')).not.toBeNull()
    expect(screen.getByText('147/557 · 26%')).not.toBeNull()
    expect(screen.getByText('Accuracy 78%')).not.toBeNull()

    fireEvent.click(screen.getByText('Browse all certifications'))

    expect(onBrowseAll).toHaveBeenCalledTimes(1)
  })

  it('keeps the cert switcher capped to eighty percent height', () => {
    render(
      <CertSwitcherSheet
        open
        onClose={vi.fn()}
        onBrowseAll={vi.fn()}
        onSelectCert={vi.fn()}
        currentCert="DVA-C02"
        answered={0}
        total={557}
        accuracy={0}
      />,
    )

    const dialog = screen.getByRole('dialog')
    const panel = dialog.lastElementChild as HTMLElement

    expect(panel.className.split(/\s+/)).toContain('max-h-[80%]')
  })

  it('offers CLF as a switchable ready cert', () => {
    const onSelectCert = vi.fn()

    render(
      <CertSwitcherSheet
        open
        onClose={vi.fn()}
        onBrowseAll={vi.fn()}
        onSelectCert={onSelectCert}
        currentCert="DVA-C02"
        answered={0}
        total={557}
        accuracy={0}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Cloud Practitioner/ }))

    expect(onSelectCert).toHaveBeenCalledWith('CLF-C02')
  })

  it('keeps the other-cert preview capped to two entries', () => {
    render(
      <CertSwitcherSheet
        open
        onClose={vi.fn()}
        onBrowseAll={vi.fn()}
        onSelectCert={vi.fn()}
        currentCert="DVA-C02"
        answered={0}
        total={557}
        accuracy={0}
      />,
    )

    expect(screen.getByText(/CLF-C02/)).not.toBeNull()
    expect(screen.getByText(/AIF-C01/)).not.toBeNull()
    expect(screen.queryByText(/SAA-C03/)).toBeNull()
  })

  it('sorts ready preview certs by answered count before upcoming certs', () => {
    const readyCerts = READY_CERTS as unknown as string[]
    readyCerts.splice(0, READY_CERTS.length, 'CLF-C02', 'DVA-C02', 'SAA-C03')
    const repository = new LocalProgressRepository('anonymous')
    repository.recordAnswer(1, ['A'], true, 'CLF-C02')
    repository.recordAnswer(1, ['A'], true, 'SAA-C03' as CertCode)
    repository.recordAnswer(2, ['A'], true, 'SAA-C03' as CertCode)

    render(
      <CertSwitcherSheet
        open
        onClose={vi.fn()}
        onBrowseAll={vi.fn()}
        onSelectCert={vi.fn()}
        currentCert="DVA-C02"
        answered={0}
        total={557}
        accuracy={0}
      />,
    )

    const saa = screen.getByText(/SAA-C03/)
    const clf = screen.getByText(/CLF-C02/)
    expect(saa.compareDocumentPosition(clf) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(screen.queryByText(/AIF-C01/)).toBeNull()
  })
})
