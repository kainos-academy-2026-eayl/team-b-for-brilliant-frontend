export interface Profile {
  email: string
  firstname: string | null
  surname: string | null
  addressLine1: string | null
  addressLine2: string | null
  postcode: string | null
}

export interface ProfileInput {
  firstname: string
  surname: string
  addressLine1: string
  addressLine2: string
  postcode: string
}
