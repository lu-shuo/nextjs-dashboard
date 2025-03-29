'use server'
// By adding the 'use server', you mark all the exported functions within the file as Server Actions.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import postgres from 'postgres'

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' })

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
})

export type State = {
  errors?: {
    customerId?: string[]
    amount?: string[]
    status?: string[]
  }
  message?: string | null
}

const CreateInvoice = FormSchema.omit({ id: true, date: true })
export async function createInvoice(prevState: State, formData: FormData) {
  // If you're working with forms that have many fields, you may want to consider using the entries() method with JavaScript's Object.fromEntries().
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  })

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    }
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data

  // It's usually good practice to store monetary values in cents in your database to eliminate JavaScript floating-point errors and ensure greater accuracy.
  const amountInCents = amount * 100
  const date = new Date().toISOString().split('T')[0]

  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `
  } catch (error) {
    // If a database error occurs, return a more specific error.
    return {
      message: 'Database Error: Failed to Create Invoice.',
    }
  }

  // Once the database has been updated, the /dashboard/invoices path will be revalidated, and fresh data will be fetched from the server.
  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

// Use Zod to update the expected types
const UpdateInvoice = FormSchema.omit({ id: true, date: true })
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    }
  }

  const { customerId, amount, status } = validatedFields.data
  const amountInCents = amount * 100
  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId},
        amount = ${amountInCents},
        status = ${status}
    WHERE id = ${id}
  `
  } catch (error) {
    return { message: 'Database Error: Failed to Update Invoice.' }
  }

  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

export async function deleteInvoice(id: string) {
  await sql`
    DELETE FROM invoices
    WHERE id = ${id}
  `
  revalidatePath('/dashboard/invoices')
}
