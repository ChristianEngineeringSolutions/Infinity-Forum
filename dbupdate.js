(async function(){
    const mongoose = require('mongoose');
    require('dotenv').config();
    // Database Connection Setup
    mongoose.connect((await accessSecret("MONGODB_CONNECTION_URL")), {
        useNewUrlParser: true,
        useCreateIndex: true,
        useFindAndModify: false,
        useUnifiedTopology: true
    }).then(() => {
        console.log('Connected to MongoDB');
    }).catch((err) => {
        console.error('MongoDB connection error:', err);
        // Implement proper cleanup
        process.exit(1);
    });
    async function accessSecret(secretName) {
      if (process.env.REMOTE == 'true') {
        if (!client) {
          client = new SecretManagerServiceClient();
        }
        const [version] = await client.accessSecretVersion({
          name: `projects/${process.env.GCLOUD_PROJECT}/secrets/${secretName}/versions/latest`,
        });
        return version.payload.data.toString();
      } else {
        return process.env[secretName];
      }
    }
    // Models
    const { Passage, PassageSchema } = require('./models/Passage');
    const { User, UserSchema } = require('./models/User');
    // const { Interaction, InteractionSchema } = require('./models/Interaction');
    // const { Category, CategorySchema } = require('./models/Category');
    // const { Subcat, SubcatSchema } = require('./models/Subcat');
    // const { Subforum, SubforumSchema } = require('./models/Subforum');
    // const { Visitor, VisitorSchema } = require('./models/Visitor');
    // const { Follower, FollowerSchema } = require('./models/Follower');
    // const { Notification, NotificationSchema } = require('./models/Notification');
    // const { Star, StarSchema } = require('./models/Star');
    // const { JTI, JTISchema } = require('./models/JTI');

    // Helper function to update models
    async function updateModel(Model, ModelSchema) {
        // Fetch all documents from the collection
        const documents = await Model.find({}).lean();
        console.log(`Found ${documents.length} documents in ${Model.modelName}`);
        
        for (const doc of documents) {
            const update = {};

            // Iterate over each field in the ModelSchema
            for (const [key, schemaPath] of Object.entries(ModelSchema.paths)) {
                if (key !== '_id' && key !== '__v' && schemaPath.defaultValue !== undefined) {
                    // Check if the field does not exist in the document
                    if (!(key in doc)) {
                        // Get the proper default value
                        let defaultValue;
                        
                        if (typeof schemaPath.getDefault === 'function') {
                            // Use Mongoose's built-in method to get defaults
                            defaultValue = schemaPath.getDefault();
                        } else if (schemaPath.defaultValue !== undefined) {
                            defaultValue = schemaPath.defaultValue;
                        } else if (typeof schemaPath.default === 'function') {
                            defaultValue = schemaPath.default();
                        } else {
                            defaultValue = schemaPath.default;
                        }
                        
                        update[key] = defaultValue;
                    }
                }
            }

            // If there are fields to update, perform the update operation
            if (Object.keys(update).length > 0) {
                console.log(`Updating document with ID ${doc._id}:`, update);
                await Model.updateOne({ _id: doc._id }, { $set: update });
            }
        }
    }
    async function cleanupFunctionStringFields(Model) {
  // Find documents where medium or compressed are arrays containing function strings
  const functionPattern = /function\(\)/;
  
  const query = {
    $or: [
      { medium: { $elemMatch: { $regex: functionPattern } } },
      { compressed: { $elemMatch: { $regex: functionPattern } } }
      // Add other fields if needed
    ]
  };
  
  const count = await Model.countDocuments(query);
  console.log(`Found ${count} documents with function strings in arrays`);
  
  if (count > 0) {
    // Fields to clean
    const fieldsToUnset = {
      medium: 1,
      compressed: 1,
      // Add other fields as needed based on your document structure
    };
    
    const result = await Model.updateMany(query, { $unset: fieldsToUnset });
    console.log(`Fixed ${result.modifiedCount || result.nModified} documents in ${Model.modelName}`);
  } else {
    console.log(`No documents to fix in ${Model.modelName}`);
  }
}

// Run this before your updateModel function
// try {
//   await cleanupFunctionStringFields(Passage);
//   // Then run your normal update to set proper defaults
//   // await updateModel(Passage, PassageSchema);
//   console.log('All updates completed.');
// } catch (error) {
//   console.error('Error updating models:', error);
// }
    // Update each model
    try {
        var passage = await Passage.findOne({medium:{$exists:false}}).lean();
        await updateModel(Passage, PassageSchema);
        await updateModel(User, UserSchema);
        console.log('All updates completed.');
    } catch (error) {
        console.error('Error updating models:', error);
    }
    process.exit();
    // await updateModel(Interaction, InteractionSchema);
    // await updateModel(Category, CategorySchema);
    // await updateModel(Subcat, SubcatSchema);
    // await updateModel(Subforum, SubforumSchema);
    // await updateModel(Visitor, VisitorSchema);
    // await updateModel(Follower, FollowerSchema);
    // await updateModel(Notification, NotificationSchema);
    // await updateModel(Star, StarSchema);
    // await updateModel(JTI, JTISchema);

 })();