<div align="center">
	<br />
	<p>
		<a href="https://www.npmjs.com/package/faunatic"><img src="_readme/cover.png" width="400" alt="faunatic logo" /></a>
	</p>
	<br />
	<p>
		<a href="https://www.npmjs.com/package/faunatic"><img src="https://img.shields.io/npm/v/faunatic.svg?maxAge=3600" alt="npm version" /></a>
		<a href="https://www.npmjs.com/package/faunatic"><img src="https://img.shields.io/npm/dt/faunaticW.svg?maxAge=3600" alt="npm downloads" /></a>
		<a href="https://www.npmjs.com/package/faunatic"><img src="https://img.shields.io/bundlephobia/min/faunatic" alt="npm downloads" /></a>
		<a href="https://www.npmjs.com/package/faunatic"><img src="https://img.shields.io/aur/last-modified/faunatic" alt="npm downloads" /></a>
	</p>
</div>

---

**Note:** This package is in alpha release, it's currently a MVP and should at the moment not be used 100% reliably
in production.

## About

Faunatic is a simple wrapper for Fauna (DB) / FaunaDB that makes it easier to do simple operations in a type-friendly
and efficient way.
The goal is to drastically improve developer experience by ensuring everything is properly typed and parsed/validated.

## Getting started

It's really simple to get started:

1. Install `faunatic` (`yarn add faunatic` or `npm i faunatic`)
2. Retrieve your Fauna secrets ([Fauna](https://fauna.com))
3. Define your data models
4. Setup your database

### 1. Installing

Install the module with your preferred package manager!

Yarn:

```
yarn add faunatic
```

NPM:

```
npm i faunatic
```

### 2. Retrieving secrets

In order to use Faunatic you have to retrieve the admin/server secret from your current database in Fauna. Keep this
noted
down.

### 3. Define your schemas

Now that faunatic has been installed, you can go ahead and define models for your database. As an example:

```typescript
import { faunatic } from "./faunatic";


const UserSchema = new faunatic.DefinedSchema(
    z.object({
        name: z.string(),
        email: z.string()
            .email()
    })
);

const TeamSchema = new faunatic.DefinedSchema(
    z.object({
        name: z.string(),
        ownerUser: z.string()
    })
);
```

Schemas are what defines how the data structure should be. With Faunatic, it's **required** that all schemas are
objects.

### 4. Set up your models

With the schemas defined, it's time to connect the schemas with a corresponding model. If you've used Mongoose
previously,
it's somewhat similar, but with some extra features and parameters. Example:

```typescript
// Here we define a model/collection called "team", with the TeamSchema, no relations and one index
const teams = faunatic.model({
    name: "team",
    schema: TeamSchema,
    relations: {},
    indexes: {
        // This index allows us to retrieve teams based on the ownerUser
        byOwner: {
            terms: [
                d => d.data.ownerUser
            ]
        }
    },
});

const users = faunatic.model({
    name: "user",
    schema: UserSchema,
    relations: {},
    indexes: {
        // This index sets a unique constraint based on the "data.email" field, and also allows us to get a user by email! 
        byEmail: {
            unique: true,
            terms: [
                d => d.data.email
            ]
        }
    }
});
```

### 5. Initiate your models

Now that everything is set up, all that remains is to initiate the models. Faunatic goes through the provided model
definitions,
and creates them if they don't exist, in addition to the indexes you have provided. It's super simple to do!

```typescript
const client = new faunatic.Client({ secret: "my-fauna-secret" });
await client.init([
    teams,
    users
]);
```

### 6. Start coding!

Now, faunatic has handled collection creation and index creation for you automatically, and provides a strict schema
approach on all your models.
Here are some things you can do:

```typescript
// == CRUD operations == //

// == CREATION
const createdUser = await users.create({
    name: "my name",
    email: "my@email.com"
});

// == RETRIEVAL
const user = await users.get("123");
console.log(user.id); // => "123"
console.log(user.data.email); // => "my@email.com"

// == UPDATING 
// Option 1:
const updatedUser = await users.update("123", {
    name: "hello world"
});

// Option 2:
const updatedUser2 = await user.update({
    name: "hello world"
});

// == DELETION
// Option 1:
const deletedUser = await users.delete("123");
// Option 2:
const deletedUser2 = await createdUser.delete();

const countedUsers = await users.count();
const countedTeams = await teams.count();

console.log(`There are ${ countedUsers } users and ${ countedTeams } teams!`);
const listedUsers = await users.list();
const listedTeams = await teams.list();

listedUsers.data.map(user => {
    console.log(`User: ${ user.id }`); // => "User: XXX"
});
```

---

## Roadmap

There are a lot of features that I personally want to see added to this project, and I've tried to outline them below:

### Idea: Type-safe query builder

Fauna is really nice for developers as it offers a nice free plan, is extremely scalable and cost-effective.
However, the DX experience when building bigger and more complex queries is a bit lacking. Although I would love
to launch faunatic with a query builder from the start, it requires some thorough thoughts, and a planned "syntax".

For now, I've started with nothing in this field, but I am looking forward to suggestions and feedback overall.

### Idea: CLI Tool and setup

As with the other popular ORMs/wrappers on the market, I wish for faunatic to introduce CLI commands to set up
databases,
update collections/indexes and handle other operations (such as migrations).

### Idea: Schema/data migration (tool)

Although Fauna is a NoSQL (document) database, practically all applications today have defined data structures/schemas.
In the standard relational databases and with other tools, migrating data and schema is not that tough as everything is
enforced on the database level, and updating a schema practically means the database needs to change as well
immediately.

This is different with Fauna, as it's a NoSQL database and there's no database-level schema defined, so one needs to
develop
a tool for migration that can handle multiple strategies. For example, here are some common migration patterns in NoSQL:

* **Migrate documents only on retrieval** - Whenever you retrieve a document, it would check the migration version and
  apply the correct migrations on the document, then save it.
* **Go through all documents and migrate** - Pretty straightforward, go through all the documents and migrate each
  document to the latest version.
* **Don't migrate documents, only add backwards compatibility**

Each come with their own pros and cons. Ultimately, it's up to the developer to handle how they should migrate (if at
all) their data,
but I think it would be really nice to provide a tool similar to Prisma Migrate which handles a lot of common use cases
for this.
