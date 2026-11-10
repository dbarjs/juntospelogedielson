# Juntos pelo Gedielson

A public PIX donation page for the "Juntos pelo Gedielson" campaign. A Payer enters an amount and gets a Charge to pay into the Default Account; the Operator manages Bank Accounts and reviews Charges.

## Language

### Money in

**Charge**:
A request for one specific amount, created on one Bank Account and shown to the Payer as a QR code and its Copia e Cola (PIX's _cobrança_). It is Pending until it is Paid or Expired.
_Avoid_: Transaction, order, invoice, donation

**Payment**:
The Pix transfer that settles a Charge.
_Avoid_: Transaction, donation, transfer

**Copia e Cola**:
The text form of a Charge's QR code, which the Payer pastes into their banking app instead of scanning.
_Avoid_: Pix code, BR Code, payload

### Receiving money

**Bank Account**:
An account at a Provider that receives Payments on one Pix Key, registered with the credentials needed to create Charges on it. A removed Bank Account never creates Charges again, but its Charges still name it.
_Avoid_: Wallet, receiver, integration

**Pix Key**:
The key (CPF/CNPJ, e-mail, phone or random) that a Bank Account's Charges are created on. Each Bank Account has exactly one, and it never changes.
_Avoid_: Chave, key, address

**Provider**:
The bank whose PIX API creates and tracks a Bank Account's Charges: Efí Bank or Inter (Inter Empresas).
_Avoid_: PSP, gateway, bank integration

**Default Account**:
The Bank Account that new Charges are created on. Exactly one Bank Account is the Default Account at a time.
_Avoid_: Main account, primary account

### People

**Payer**:
Anyone who opens the payment page and pays a Charge from their own banking app. We never ask who they are.
_Avoid_: Donor, customer, user

**Operator**:
The one person who signs in to manage Bank Accounts and review Charges.
_Avoid_: Admin, owner, user
