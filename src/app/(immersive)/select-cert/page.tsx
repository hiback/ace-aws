import { SelectCertClient } from './select-cert-client'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SelectCertPage({ searchParams }: { searchParams: SearchParams }) {
  const mode = (await searchParams).mode

  return <SelectCertClient requestedMode={mode === 'switch' ? 'switch' : 'onboarding'} />
}
