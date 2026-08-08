const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const normalizeName = value => String(value ?? '').replace(/　/g, ' ').trim().replace(/\s+/g, ' ')

async function upsertGroups(scope, groups) {
  const existing = await prisma.itemPreset.findMany({
    where: { scope },
    select: { category: true, name: true },
  })
  const keys = new Set(existing.map(row => `${row.category}\u0000${row.name}`))
  let created = 0
  let updated = 0
  for (const group of groups.values()) {
    const key = `${group.category}\u0000${group.name}`
    await prisma.itemPreset.upsert({
      where: { scope_category_name: { scope, category: group.category, name: group.name } },
      create: { scope, category: group.category, name: group.name, usageCount: group.count },
      update: { usageCount: group.count },
    })
    if (keys.has(key)) updated += 1
    else created += 1
  }
  return { created, updated }
}

function addGroup(groups, category, rawName) {
  const name = normalizeName(rawName)
  if (!name) return
  const key = `${category}\u0000${name}`
  const current = groups.get(key)
  if (current) current.count += 1
  else groups.set(key, { category, name, count: 1 })
}

async function main() {
  const [lineItems, suppliers] = await Promise.all([
    prisma.lineItem.findMany({ select: { category: true, label: true, costCenter: true } }),
    prisma.supplier.findMany({ select: { name: true } }),
  ])
  const lineGroups = new Map()
  const supplierGroups = new Map()
  const centerGroups = new Map()
  for (const row of lineItems) {
    addGroup(lineGroups, row.category, row.label)
    addGroup(centerGroups, '', row.costCenter)
  }
  for (const row of suppliers) addGroup(supplierGroups, '', row.name)
  for (const name of ['中區', '總部', '市場', '中和']) {
    const key = `\u0000${name}`
    if (!centerGroups.has(key)) addGroup(centerGroups, '', name)
  }

  const results = {
    LINE_ITEM: await upsertGroups('LINE_ITEM', lineGroups),
    SUPPLIER: await upsertGroups('SUPPLIER', supplierGroups),
    COST_CENTER: await upsertGroups('COST_CENTER', centerGroups),
  }
  for (const [scope, result] of Object.entries(results)) {
    console.log(`${scope}: 新增 ${result.created}，更新 ${result.updated}`)
  }
}

main()
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
