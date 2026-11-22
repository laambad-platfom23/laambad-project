const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");

const p = new PrismaClient();

async function main() {
  const roles = [
    { slug: "admin", name: "Admin" },
    { slug: "instructor", name: "Instructor" },
    { slug: "user", name: "User" },
  ];
  const perms = [
    "courses.read",
    "courses.manage",
    "users.read",
    "users.write",
    "research.read",
    "research.submit",
    "research.moderate",
    "research.review",
    "notifications.read",
    "files.upload",
  ];

  const permIds = {};
  for (const key of perms) {
    let row = await p.permission.findFirst({ where: { key, deletedAt: null } });
    if (!row) {
      row = await p.permission.create({
        data: {
          id: randomUUID(),
          name: key,
          key,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    permIds[key] = row.id;
  }

  for (const r of roles) {
    let role = await p.role.findFirst({ where: { slug: r.slug, deletedAt: null } });
    if (!role) {
      role = await p.role.create({
        data: {
          id: randomUUID(),
          name: r.name,
          slug: r.slug,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    const keys =
      r.slug === "user"
        ? [
            "courses.read",
            "research.read",
            "research.submit",
            "notifications.read",
            "files.upload",
          ]
        : r.slug === "instructor"
          ? [
              "courses.read",
              "courses.manage",
              "research.read",
              "research.submit",
              "notifications.read",
              "files.upload",
            ]
          : perms;
    for (const key of keys) {
      await p.rolePermission.upsert({
        where: {
          permissionId_roleId: {
            permissionId: permIds[key],
            roleId: role.id,
          },
        },
        create: { permissionId: permIds[key], roleId: role.id },
        update: {},
      });
    }
  }

  const counts = {
    roles: await p.role.count(),
    permissions: await p.permission.count(),
    users: await p.user.count(),
  };
  console.log(JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
