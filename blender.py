#Blender add-on for christianengineeringsolutions.com
#Requirements:
#GET all passages with mimetype.split('/')[0] == model

import bpy
import requests
import json
import tempfile
import bpy.utils.previews
import os

directory   = os.path.join(bpy.utils.user_resource('SCRIPTS'), "presets", "scatter_presets_custom\\")
list_raw = []

sources = [];

search = ''

website = "https://christianengineeringsolutions.com"
website = "http://localhost:3000"

#for alerts
def ShowMessageBox(message = "", title = "Message Box", icon = 'INFO'):

    def draw(self, context):
        self.layout.label(text=message)

    bpy.context.window_manager.popup_menu(draw, title = title, icon = icon)

#get list of models
#r = requests.get('https://christianengineeringsolutions.com/models');
r = requests.get(website + '/models');
#load dict from json from server response text
#test with one model first ([0])
models = json.loads(r.text)

power_list = {};

#List thumbnails
for model in models:
#    get file
    req = requests.get(website + '/uploads/' + model["filename"])
    model["file"] = req.content
    with open('/home/uriah/Desktop/' + model["filename"], 'wb') as f:
        f.write(req.content)
#    get thumbnail
    req = requests.get(website + '/uploads/' + model["thumbnail"])
    model["image"] = '/home/uriah/Desktop/' + model["thumbnail"]
    with open('/home/uriah/Desktop/' + model["thumbnail"], 'wb') as f:
        f.write(req.content)
        power_list[model["title"]] = {
            "filepath": '/home/uriah/Desktop/' + model["filename"],
            "_id": model["_id"]
        }
#    if model["title"] == "Test":
#        selected = model
#        req = requests.get('http://localhost:3000/uploads/' + selected["filename"])
#        file = req.content

#verify filename
#ShowMessageBox(obj["filename"]) 

#save model from server
#filepath = '/home/uriah/Desktop/new3.glb'
#tmp = tempfile.NamedTemporaryFile(delete=False)
#ShowMessageBox(tmp.name)
#tmp.write(file)

#with open(filepath, 'wb') as f:
#    f.write(file)

#import selected model into current scene
#imported_object = bpy.ops.import_scene.gltf(filepath=tmp.name)

#GOOD CODE

#imported_object = bpy.ops.import_scene.gltf(filepath=filepath)
#obj_object = bpy.context.selected_objects[0] ####<--Fix

# /GOOD CODE




bl_info = {
    "name": "Add-on Template",
    "description": "",
    "author": "p2or",
    "version": (0, 0, 3),
    "blender": (2, 80, 0),
    "location": "3D View > Tools",
    "warning": "", # used for warning icon and text in addons panel
    "wiki_url": "",
    "tracker_url": "",
    "category": "Development"
}


import bpy

from bpy.props import (StringProperty,
                       BoolProperty,
                       IntProperty,
                       FloatProperty,
                       FloatVectorProperty,
                       EnumProperty,
                       PointerProperty,
                       )
from bpy.types import (Panel,
                       Menu,
                       Operator,
                       PropertyGroup,
                       )


# ------------------------------------------------------------------------
#    Scene Properties
# ------------------------------------------------------------------------

class MyProperties(PropertyGroup):

    my_bool: BoolProperty(
        name="Enable or Disable",
        description="A bool property",
        default = False
        )

    my_int: IntProperty(
        name = "Int Value",
        description="A integer property",
        default = 23,
        min = 10,
        max = 100
        )

    my_float: FloatProperty(
        name = "Float Value",
        description = "A float property",
        default = 23.7,
        min = 0.01,
        max = 30.0
        )

    my_float_vector: FloatVectorProperty(
        name = "Float Vector Value",
        description="Something",
        default=(0.0, 0.0, 0.0), 
        min= 0.0, # float
        max = 0.1
    ) 

    my_string: StringProperty(
        name="User Input",
        description=":",
        default="",
        maxlen=1024,
        )
    
    search_str: StringProperty(
        name="",
        description=":",
        default="",
        maxlen=1024,
        )
        
    title_str: StringProperty(
        name="",
        description=":",
        default="Untitled",
        maxlen=1024,
        )
        
    username: StringProperty(
        name="",
        description=":",
        default="Username",
        maxlen=1024,
        )
    
    password: StringProperty(
        name="",
        description=":",
        default="Password",
        maxlen=1024,
        subtype="PASSWORD"
        )

    my_path: StringProperty(
        name = "Directory",
        description="Choose a directory:",
        default="",
        maxlen=1024,
        subtype='DIR_PATH'
        )
        
    my_enum: EnumProperty(
        name="Dropdown:",
        description="Apply Data to attribute.",
        items=[ ('OP1', "Option 1", ""),
                ('OP2', "Option 2", ""),
                ('OP3', "Option 3", ""),
               ]
        )

# ------------------------------------------------------------------------
#    Operators
# ------------------------------------------------------------------------

libs = bpy.data.libraries

class WM_OT_HelloWorld(Operator):
    bl_label = "Search"
    bl_idname = "wm.hello_world"

    def execute(self, context):
        scene = context.scene
        mytool = scene.my_tool

        # print the values to the console
        print("Hello World")
        print("bool state:", mytool.my_bool)
        print("int value:", mytool.my_int)
        print("float value:", mytool.my_float)
        print("string value:", mytool.my_string)
        print("enum state:", mytool.my_enum)

        return {'FINISHED'}

class Upload(Operator):
    bl_label = "Upload Scene"
    bl_idname = "wm.upload"

    def execute(self, context):
        scene = context.scene
        mytool = scene.my_tool

        # print the values to the console
        print("Hello World")
        print("username state:", mytool.username)
        print("password value:", mytool.password)
    
#        Export and save file
        blend_file_path = bpy.data.filepath
        directory = os.path.dirname(blend_file_path)
        target_file = os.path.join(directory, 'myfile.obj')

        bpy.ops.export_scene.obj(filepath=target_file)
        
#        Upload to CES
        upload_data = {
            "sources": sources,
            "username": mytool.username,
            "password": mytool.password,
            "title": mytool.title_str
        }
        files = {'upload_file': open(target_file,'rb')}
        x = requests.post(website + "/upload_model", files=files, json=upload_data)


        return {'FINISHED'}

class Add_Object(Operator):
    bl_label = "Cite"
    bl_idname = "wm.cite"
    test: bpy.props.StringProperty()

    def execute(self, context):
        scene = context.scene
        mytool = scene.my_tool
        
#        Import Object
        imported_object = bpy.ops.import_scene.gltf(filepath=power_list[self.test]["filepath"])
        obj_object = bpy.context.selected_objects[0] ####<--Fix
        
        sources.append(power_list[self.test]["_id"])
        
        ShowMessageBox(json.dumps(sources))

        return {'FINISHED'}

# ------------------------------------------------------------------------
#    Menus
# ------------------------------------------------------------------------

class OBJECT_MT_CustomMenu(bpy.types.Menu):
    bl_label = "Select"
    bl_idname = "OBJECT_MT_custom_menu"

    def draw(self, context):
        layout = self.layout

        # Built-in operators
        layout.operator("object.select_all", text="Select/Deselect All").action = 'TOGGLE'
        layout.operator("object.select_all", text="Inverse").action = 'INVERT'
        layout.operator("object.select_random", text="Random")

# ------------------------------------------------------------------------
#    Panel in Object Mode
# ------------------------------------------------------------------------

class OBJECT_PT_CustomPanel(Panel):
    bl_label = "CES Connect"
    bl_idname = "OBJECT_PT_custom_panel"
    bl_space_type = "VIEW_3D"   
    bl_region_type = "UI"
    bl_category = "Tools"
    bl_context = "objectmode"   


    @classmethod
    def poll(self,context):
        return context.object is not None

    def draw(self, context):
        global custom_icons
        layout = self.layout
        scene = context.scene
        mytool = scene.my_tool
        
        layout.label(text="Search")
        layout.prop(mytool, "search_str")
        layout.operator("wm.hello_world")
        layout.separator()
        layout.prop(mytool, "title_str")
        layout.operator("wm.upload")
        layout.prop(mytool, "username")
        layout.prop(mytool, "password")
        
#        list out model titles
        for model in models:
            layout.label(text=model["title"])
            self.layout.template_icon(icon_value=custom_icons[model["thumbnail"][:-4]].icon_id,scale=10)
            operator = layout.operator("wm.cite")
            operator.test = model['title']
            layout.separator()
            
        
#        layout.prop(mytool, "my_bool")
#        layout.prop(mytool, "my_enum", text="") 
#        layout.prop(mytool, "my_int")
#        layout.prop(mytool, "my_float")
#        layout.prop(mytool, "my_float_vector", text="")
#        layout.prop(mytool, "my_string")
#        layout.prop(mytool, "my_path")
        
#        layout.menu(OBJECT_MT_CustomMenu.bl_idname, text="Presets", icon="SCENE")

# ------------------------------------------------------------------------
#    Registration
# ------------------------------------------------------------------------

classes = (
    MyProperties,
    WM_OT_HelloWorld,
    Upload,
    Add_Object,
    OBJECT_MT_CustomMenu,
    OBJECT_PT_CustomPanel
)

def register():
    from bpy.utils import register_class
    for cls in classes:
        register_class(cls)
    global custom_icons
    custom_icons = bpy.utils.previews.new()

    for model in models:
        custom_icons.load(model["thumbnail"][:-4], os.path.join(directory, model["image"]), 'IMAGE')

    bpy.types.Scene.my_tool = PointerProperty(type=MyProperties)

def unregister():
    from bpy.utils import unregister_class
    for cls in reversed(classes):
        unregister_class(cls)
    del bpy.types.Scene.my_tool


if __name__ == "__main__":
    register()