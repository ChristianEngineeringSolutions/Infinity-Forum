#Blender add-on for christianengineeringsolutions.com
#Currently, copy/paste into blender scripts and run
# Official app on the way
# Combine models while maintaining sources
# Work on CES through blender!

import bpy
import requests
import json
import tempfile
import bpy.utils.previews
import os

directory   = os.path.join(bpy.utils.user_resource('SCRIPTS'), "presets", "scatter_presets_custom\\")
list_raw = []

sources = [];

#Where you want to save data
dir = "/home/uriah/Desktop/"

search = ''

website = "https://christianengineeringsolutions.com"
website = "http://localhost:3000"

#for alerts
def ShowMessageBox(message = "", title = "Message Box", icon = 'INFO'):

    def draw(self, context):
        self.layout.label(text=message)

    bpy.context.window_manager.popup_menu(draw, title = title, icon = icon)

page = 1
models = []


power_list = {};

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

def SearchModels(query="", which="Models"):
    global models
    global dir
    models = []
    if which == "Models":
        data = {
            "query": query,
            "page": page
        }
        r = requests.get(website + '/models', params=data)
        models = json.loads(r.text)
    #    ShowMessageBox(json.dumps(models))
        #List thumbnails
        for model in models:
        #    get thumbnail
            req = requests.get(website + '/uploads/' + model["thumbnail"])
            model["image"] = dir + model["thumbnail"]
            with open(dir + model["thumbnail"], 'wb') as f:
                f.write(req.content)
            power_list[model["title"]] = {
                "filepath": dir + model["filename"],
                "_id": model["_id"]
            }
    elif which == "SVGs":
        data = {
            "query": query,
            "page": page
        }
        r = requests.get(website + '/svgs', params=data)
        models = json.loads(r.text)
    #    ShowMessageBox(json.dumps(models))
        #List thumbnails
        for model in models:
        #    get thumbnail
            req = requests.get(website + '/uploads/' + model["thumbnail"])
            model["image"] = dir + model["thumbnail"]
            with open(dir + model["thumbnail"], 'wb') as f:
                f.write(req.content)
            power_list[model["title"]] = {
                "filepath": dir + model["filename"],
                "_id": model["_id"]
            }
    global custom_icons
    custom_icons = bpy.utils.previews.new()

    for model in models:
        if model["title"] == "SVG":
            ShowMessageBox(model["title"])
        custom_icons.load(model["thumbnail"][:-4], os.path.join(directory, model["image"]), 'IMAGE')

SearchModels()

bl_info = {
    "name": "CES Connect",
    "description": "Blender Add-On for ChristianEngineeringSolutions.com",
    "author": "Uriah Sanders",
    "version": (0, 0, 1),
    "blender": (3, 0, 1),
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
    test_items = [
    ("Models", "Models", "", 1),
    ("SVGs", "SVGs", "", 2),
]
    
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
        
    which: EnumProperty(
        name="",
        items=test_items,
        description="offers....",
    )

# ------------------------------------------------------------------------
#    Operators
# ------------------------------------------------------------------------

class Search(Operator):
    bl_label = "Search"
    bl_idname = "wm.search"

    def execute(self, context):
        scene = context.scene
        mytool = scene.my_tool
        global page
        
        page = 1
        SearchModels(mytool.search_str, mytool.which)

        return {'FINISHED'}

class ViewMore(Operator):
    bl_label = "View More"
    bl_idname = "wm.view_more"

    def execute(self, context):
        scene = context.scene
        mytool = scene.my_tool
        global page
        
        page += 1
        
        SearchModels(mytool.search_str, mytool.which)
        

        return {'FINISHED'}

class Upload(Operator):
    bl_label = "Upload Scene"
    bl_idname = "wm.upload"

    def execute(self, context):
        scene = context.scene
        mytool = scene.my_tool
        
        which = mytool.which
#        Export and save file
        blend_file_path = bpy.data.filepath
        directory = os.path.dirname(blend_file_path)
        target_file = os.path.join(directory, 'myfile.glb')
        
        if which == "Models":
            target_file = os.path.join(directory, 'myfile.glb')
            bpy.ops.export_scene.gltf(filepath=target_file)
        elif which == "SVGs":
            target_file = os.path.join(directory, 'myfile.svg')
            bpy.ops.wm.gpencil_export_svg(filepath=target_file)
        
#        Upload to CES
        upload_data = {
            "sources": sources,
            "username": mytool.username,
            "password": mytool.password,
            "title": mytool.title_str
        }
        files = {'file': open(target_file,'rb')}
        if which == "Models":
            x = requests.post(website + "/upload_model", files=files, data=upload_data)
        elif which == "SVGs":
            x = requests.post(website + "/upload_svg", files=files, data=upload_data)
        ShowMessageBox(x.text)


        return {'FINISHED'}

class Add_Object(Operator):
    bl_label = "Cite"
    bl_idname = "wm.cite"
    title: bpy.props.StringProperty()
    filename: bpy.props.StringProperty()

    def execute(self, context):
        global dir
        scene = context.scene
        mytool = scene.my_tool
            #    get file
        req = requests.get(website + '/uploads/' + self.filename)
        with open(dir + self.filename, 'wb') as f:
            f.write(req.content)
#        Import Object

        if mytool.which == "Models":
            imported_object = bpy.ops.import_scene.gltf(filepath=power_list[self.title]["filepath"])
        elif mytool.which == "SVGs":
            imported_object = bpy.ops.wm.gpencil_import_svg(filepath=power_list[self.title]["filepath"])
            
        obj_object = bpy.context.selected_objects[0] ####<--Fix
        
        
        new_source = power_list[self.title]["_id"]
        added = False
#        Only add source if not there already
        for source in sources:
            if(new_source == source):
                added = True
                break
        if added == False:
            sources.append(power_list[self.title]["_id"])

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
#        SearchModels()
        global custom_icons
        global models
        layout = self.layout
        scene = context.scene
        mytool = scene.my_tool
        
        layout.label(text="Search")
        layout.prop(mytool, "which")
        layout.prop(mytool, "search_str")
        layout.operator("wm.search")
        layout.separator()
        layout.prop(mytool, "title_str")
        layout.operator("wm.upload")
        layout.prop(mytool, "username")
        layout.prop(mytool, "password")
#        ShowMessageBox(json.dumps(models))
#        list out model titles
        for model in models:
            layout.label(text=model["title"])
            self.layout.template_icon(icon_value=custom_icons[model["thumbnail"][:-4]].icon_id,scale=10)
            operator = layout.operator("wm.cite")
            operator.title = model['title']
            operator.filename = model['filename']
            layout.separator()
        
        layout.separator()
        layout.operator("wm.view_more")

# ------------------------------------------------------------------------
#    Registration
# ------------------------------------------------------------------------

classes = (
    MyProperties,
    Search,
    Upload,
    ViewMore,
    Add_Object,
    OBJECT_MT_CustomMenu,
    OBJECT_PT_CustomPanel
)

def register():
    from bpy.utils import register_class
    for cls in classes:
        register_class(cls)

    bpy.types.Scene.my_tool = PointerProperty(type=MyProperties)

def unregister():
    from bpy.utils import unregister_class
    for cls in reversed(classes):
        unregister_class(cls)
    del bpy.types.Scene.my_tool





if __name__ == "__main__":
    register()