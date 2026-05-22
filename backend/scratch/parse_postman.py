import json

def search_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    def traverse(obj):
        if isinstance(obj, dict):
            if 'request' in obj and 'url' in obj['request'] and isinstance(obj['request']['url'], dict):
                url_path = '/'.join(obj['request']['url'].get('path', []))
                if 'institutes' in url_path.lower():
                    print("\nEndpoint:", url_path)
            for v in obj.values():
                traverse(v)
        elif isinstance(obj, list):
            for i in obj:
                traverse(i)
                
    traverse(data)

search_json('wise_collection.json')
