import { OrganizationSetupClient } from './organization-setup-client'

interface Props {
  params: {
    locale: string
  }
}

export default function OrganizationSetupPage({ params: { locale } }: Props) {
  return <OrganizationSetupClient locale={locale} />
}