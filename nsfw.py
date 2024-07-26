import pymongo
from nsfw_detector import predict
#pip install tensorrt
# check image for nsfw
myclient = pymongo.MongoClient("mongodb://localhost:27017/")

mydb = myclient["sasame"]

mycol = mydb["passages"]

model = predict.load_model('./saved_model.h5')
properties = {}
predictions = predict.classify(model, sys.argv[1])
print("WOMBO" + predictions[sys.argv[1]].porn)
if predictions[sys.argv[1]].porn > 0.5 or predictions[sys.argv[1]].hentai > 0.5:
    properties.flagged = True
    myquery = { "_id": sys.argv[3] }
    newvalues = { "$set": properties }
    mycol.update_one(myquery, newvalues)
